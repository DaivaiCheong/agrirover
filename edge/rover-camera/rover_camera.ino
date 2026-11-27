// ============================================================================
// AGRIROVER — ROVER CAMERA  (ESP32 camera boards: AI-Thinker ESP32-CAM, WROVER, M5Stack, ESP-EYE)
// One Utilities Cambodia · AgriRover
//
// A network camera for the rover. At each plant the rover program on the farm
// server (rover-brain) asks for a photo:
//     GET http://<camera>/capture          a fresh JPEG
//     GET http://<camera>/capture?flash=1  ... with the white LED on (dark days only:
//                                          it glares on wet leaves)
//     GET http://<camera>/status           JSON: size, quality, Wi-Fi signal
//     GET http://<camera>/                 a page with the latest photo, to aim the camera
// The photo then goes through the same photo check as every rover photo.
//
// It also tells the farm broker it is there, so the Rover page can show it:
//     devices/rover-01/camera/status   {"status":"online","ip":"…","url":"http://…/capture"}
//                                      retained; the last will says offline
//
// The camera never moves anything, so it holds no safety logic: the motor
// controller (rover_motor_controller.ino) does. Design: docs/architecture/rover-esp32.md
//
// Board: "AI Thinker ESP32-CAM" (esp32:esp32:esp32cam). Libraries: PubSubClient.
// Settings: copy secrets.h.example to secrets.h (git-ignored).
// Flashing: on an ESP32-CAM-MB USB base, just upload. Without one, hold IO0 to GND
// while it powers up.
// ============================================================================
#include "secrets.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include "esp_camera.h"

const char* DEVICE_CODE = "ROVER-CAM-01";
const char* HOSTNAME    = "rover-cam-01";          // also http://rover-cam-01.local where mDNS works
const char* FW_VERSION  = "rover-cam-1.0.0";
const char* T_STATUS    = "devices/rover-01/camera/status";
const char* WILL        = "{\"status\":\"offline\",\"device\":\"ROVER-CAM-01\"}";
const uint32_t STATUS_EVERY_MS = 30000;

// ---- Camera boards ---------------------------------------------------------------
// Boards that look alike wire the camera differently. At power-up each layout below is
// tried in turn and the first whose camera answers is kept; /status names it.
struct Board {
  const char* name;
  int8_t pwdn, reset, xclk, sda, scl, d7, d6, d5, d4, d3, d2, d1, d0, vsync, href, pclk;
  int8_t flash;                                    // white LED, -1 = none
};
const Board BOARDS[] = {
  //  name              pwdn rst xclk sda scl  Y9  Y8  Y7  Y6  Y5  Y4  Y3  Y2 vsync href pclk flash
  { "AI-Thinker",        32, -1,   0, 26, 27,  35, 34, 39, 36, 21, 19, 18,  5,  25,  23,  22,  4 },
  { "WROVER (Freenove)", -1, -1,  21, 26, 27,  35, 34, 39, 36, 19, 18,  5,  4,  25,  23,  22, -1 },
  { "M5Stack PSRAM",     -1, 15,  27, 25, 23,  19, 36, 18, 39,  5, 34, 35, 32,  22,  26,  21, -1 },
  { "M5Stack Wide",      -1, 15,  27, 22, 23,  19, 36, 18, 39,  5, 34, 35, 32,  25,  26,  21, -1 },
  { "ESP-EYE",           -1, -1,   4, 18, 23,  36, 37, 38, 39, 35, 14, 13, 34,   5,  27,  25, -1 },
};
const uint8_t PIN_LED = 33;                        // small red LED on an AI-Thinker's back, active LOW
const Board* board = nullptr;

WebServer    http(80);
WiFiClient   net;
PubSubClient mqtt(net);
uint32_t lastMqttTry = 0, lastStatusAt = 0, photos = 0;
bool     cameraOk = false;
framesize_t frameSize = FRAMESIZE_UXGA;            // 1600 x 1200 with PSRAM

bool cameraTry(const Board& b, uint32_t xclkHz) {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d7 = b.d7;  c.pin_d6 = b.d6;  c.pin_d5 = b.d5;  c.pin_d4 = b.d4;
  c.pin_d3 = b.d3;  c.pin_d2 = b.d2;  c.pin_d1 = b.d1;  c.pin_d0 = b.d0;
  c.pin_xclk = b.xclk;  c.pin_pclk = b.pclk;  c.pin_vsync = b.vsync;  c.pin_href = b.href;
  c.pin_sccb_sda = b.sda;  c.pin_sccb_scl = b.scl;  c.pin_pwdn = b.pwdn;  c.pin_reset = b.reset;
  c.xclk_freq_hz = xclkHz;
  c.pixel_format = PIXFORMAT_JPEG;
  c.grab_mode    = CAMERA_GRAB_LATEST;
  if (psramFound()) {
    c.frame_size = FRAMESIZE_UXGA;  c.jpeg_quality = 12;  c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
  } else {                                         // no PSRAM: a smaller photo still works
    c.frame_size = FRAMESIZE_SVGA;  c.jpeg_quality = 14;  c.fb_count = 1;
    c.fb_location = CAMERA_FB_IN_DRAM;
  }
  frameSize = c.frame_size;
  if (esp_camera_init(&c) != ESP_OK) { esp_camera_deinit(); return false; }
  sensor_t* s = esp_camera_sensor_get();
  if (!s) { esp_camera_deinit(); return false; }
  s->set_whitebal(s, 1);                           // leaves' colour is what the photo check reads
  s->set_awb_gain(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_gain_ctrl(s, 1);
  return true;
}

bool cameraSetup() {
  for (uint32_t hz : { 20000000UL, 10000000UL }) { // some clone sensors only start at 10 MHz
    for (const Board& b : BOARDS) {
      Serial.printf("camera: trying %s pins at %lu MHz... ", b.name, (unsigned long)(hz / 1000000));
      if (cameraTry(b, hz)) {
        board = &b;
        Serial.printf("ok, sensor PID 0x%02x\n", esp_camera_sensor_get()->id.PID);
        if (b.flash >= 0) { pinMode(b.flash, OUTPUT); digitalWrite(b.flash, LOW); }
        return true;
      }
      Serial.println("no answer");
      delay(50);
    }
  }
  return false;
}

void setFlash(bool on) { if (board && board->flash >= 0) digitalWrite(board->flash, on ? HIGH : LOW); }

const char* sizeName() { return frameSize == FRAMESIZE_UXGA ? "1600x1200" : "800x600"; }

void handleCapture() {
  if (!cameraOk) { http.send(503, "text/plain", "camera not started"); return; }
  bool flash = http.arg("flash") == "1";
  if (flash) { setFlash(true); delay(150); }
  // The rover has just moved: drop the frame the driver may be holding, keep the next.
  camera_fb_t* fb = esp_camera_fb_get();
  if (fb) esp_camera_fb_return(fb);
  fb = esp_camera_fb_get();
  if (flash) setFlash(false);
  if (!fb) { http.send(503, "text/plain", "capture failed"); return; }
  photos++;
  http.sendHeader("Cache-Control", "no-store");
  http.setContentLength(fb->len);
  http.send(200, "image/jpeg", "");
  http.client().write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleStatus() {
  char msg[220];
  snprintf(msg, sizeof msg,
           "{\"device\":\"%s\",\"fw\":\"%s\",\"board\":\"%s\",\"camera\":%s,\"size\":\"%s\",\"psram\":%s,"
           "\"rssi\":%d,\"photos\":%lu,\"uptimeS\":%lu}",
           DEVICE_CODE, FW_VERSION, board ? board->name : "none", cameraOk ? "true" : "false", sizeName(), psramFound() ? "true" : "false",
           (int)WiFi.RSSI(), (unsigned long)photos, (unsigned long)(millis() / 1000));
  http.send(200, "application/json", msg);
}

void handleRoot() {
  http.send(200, "text/html",
            "<!doctype html><meta name=viewport content='width=device-width'><title>Rover camera</title>"
            "<body style='font-family:sans-serif;margin:16px'><h3>Rover camera</h3>"
            "<p><a href='/'>New photo</a> · <a href='/?flash=1'>with flash</a> · <a href='/status'>status</a></p>"
            "<img id=p style='max-width:100%'>"
            "<script>p.src='/capture'+location.search+(location.search?'&':'?')+'t='+Date.now()</script>");
}

void publishStatus() {
  char msg[240];
  String ip = WiFi.localIP().toString();
  snprintf(msg, sizeof msg,
           "{\"status\":\"online\",\"device\":\"%s\",\"fw\":\"%s\",\"ip\":\"%s\",\"url\":\"http://%s/capture\","
           "\"camera\":%s,\"size\":\"%s\",\"rssi\":%d}",
           DEVICE_CODE, FW_VERSION, ip.c_str(), ip.c_str(), cameraOk ? "true" : "false", sizeName(), (int)WiFi.RSSI());
  mqtt.publish(T_STATUS, msg, true);
  lastStatusAt = millis();
}

void netLoop() {
  if (WiFi.status() != WL_CONNECTED) { digitalWrite(PIN_LED, HIGH); return; }
  digitalWrite(PIN_LED, LOW);                      // red LED on = on Wi-Fi
  if (!mqtt.connected()) {
    if (millis() - lastMqttTry < 3000) return;
    lastMqttTry = millis();
    if (mqtt.connect(DEVICE_CODE, MQTT_USER, MQTT_PASSWORD, T_STATUS, 1, true, WILL)) publishStatus();
    return;
  }
  mqtt.loop();
  if (millis() - lastStatusAt >= STATUS_EVERY_MS) publishStatus();
}

void setup() {
  pinMode(PIN_LED, OUTPUT);    digitalWrite(PIN_LED, HIGH);
  Serial.begin(115200);
  delay(300);                                      // let the sensor power up
  cameraOk = cameraSetup();
  Serial.printf("camera %s, PSRAM %s, photo %s\n", cameraOk ? "ok" : "FAILED", psramFound() ? "yes" : "no", sizeName());

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setSleep(false);                            // a sleeping radio makes the first photo slow
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  Serial.printf("Wi-Fi %s, IP %s\n", WiFi.status() == WL_CONNECTED ? "up" : "not yet", WiFi.localIP().toString().c_str());
  MDNS.begin(HOSTNAME);

  http.on("/", handleRoot);
  http.on("/capture", handleCapture);
  http.on("/status", handleStatus);
  http.begin();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(5);
  mqtt.setSocketTimeout(1);
  mqtt.setBufferSize(512);
}

void loop() {
  http.handleClient();
  netLoop();
}
