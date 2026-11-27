// ============================================================================
// AGRIROVER — MOTOR CONTROLLER  (ESP32 DevKit, ESP8266 NodeMCU / Wemos D1 mini, or Arduino Nano / Uno)
// One Utilities Cambodia · AgriRover
//
// Drives the two wheel motors for the rover's Raspberry Pi over USB serial.
// Protocol: drive_protocol.h (firmware) / rover/protocol.py (Pi). The Pi side
// is the same whichever board runs this sketch.
//
// SAFETY — the reason this logic lives here and not on the Pi
//   * every run is clamped to MAX_RUN_MS and MAX_PWM, whatever the Pi asks for
//   * no valid frame for LINK_TIMEOUT_MS while moving  -> motors off
//   * bumper pressed -> motors off at once; new runs refused while it is held
//   * at power-up both motors are off before anything else happens
//   The Pi can only ever ask for less than these limits, never more.
//
// Choose the motor driver below. Wiring for each board and driver:
// docs/hardware/PROTOTYPE-BUILD.md. Host test: test/test_sketch.cpp.
// ============================================================================
#include "drive_protocol.h"
#include "motor_map.h"

// ---- 1. Which motor driver is fitted ---------------------------------------
//   DRIVER_L298N   L298N / TB6612FNG: one PWM enable + two direction pins per motor
//   DRIVER_L9110S  L9110S / HG7881 / MX1508: two PWM inputs per motor, no enable
#if !defined(DRIVER_L298N) && !defined(DRIVER_L9110S)
#define DRIVER_L298N
#endif

// ---- 2. Pins ----------------------------------------------------------------
#if defined(ESP8266)
#include <ESP8266WiFi.h>
// NodeMCU / D1 mini. D3, D4 and D8 decide how the chip boots, and TX/RX carry the
// link to the Pi, so motor pins use D1 D2 D5 D6 D7 (quiet at boot) and D8, which
// the board holds low at boot, as a direction pin only.
#if defined(DRIVER_L298N)
const uint8_t PIN_ENA = D1, PIN_IN1 = D2, PIN_IN2 = D5;   // left motor
const uint8_t PIN_ENB = D6, PIN_IN3 = D7, PIN_IN4 = D8;   // right motor
#else
const uint8_t PIN_A_IA = D1, PIN_A_IB = D2;               // left motor
const uint8_t PIN_B_IA = D5, PIN_B_IB = D6;               // right motor
#endif
// D0 (GPIO16) has only a pull-down: the bumper switch goes to 3V3, pressed = HIGH.
const uint8_t PIN_BUMPER = D0;
#define BUMPER_PRESSED_LEVEL HIGH
#define BUMPER_INPUT_MODE INPUT_PULLDOWN_16
// Battery: 100k / 33k divider into A0. The board's own 220k/100k divider sits behind
// A0, so 12.6 V reads about 928. Check once against a multimeter and set VBAT_CAL.
const float VBAT_SCALE = 0.013573f;
const uint8_t PIN_VBAT = A0;
#elif defined(ARDUINO_ARCH_ESP32)
// ESP32 DevKit (ESP32-WROOM / D0WD). The motor pins are not fixed here: they are a
// saved map (see "ESP32: motor channels" below), found with the wizard on Rover > Test.
const uint8_t PIN_BUMPER = 4;                              // to GND, pressed = LOW
#define BUMPER_PRESSED_LEVEL LOW
#define BUMPER_INPUT_MODE INPUT_PULLUP
// Battery: GPIO 34 (input only, ADC1). The pin reads at most about 3.1 V, so use a
// 100k / 22k divider here, not the Nano's 100k / 33k: 12.6 V -> 2.27 V.
// Set VBAT_WIRED to 1 once the divider is fitted. Until then no BAT line is sent, so
// a bare pin reading 0 V never looks like a flat battery to the Pi.
const uint8_t PIN_VBAT = 34;
const float   VBAT_DIVIDER = (100.0f + 22.0f) / 22.0f;
#define VBAT_WIRED 0
#else
// Arduino Nano / Uno
#if defined(DRIVER_L298N)
const uint8_t PIN_ENA = 5, PIN_IN1 = 7, PIN_IN2 = 8;
const uint8_t PIN_ENB = 6, PIN_IN3 = 9, PIN_IN4 = 10;
#else
const uint8_t PIN_A_IA = 5, PIN_A_IB = 6;
const uint8_t PIN_B_IA = 9, PIN_B_IB = 10;
#endif
const uint8_t PIN_BUMPER = 2;                              // to GND, pressed = LOW
#define BUMPER_PRESSED_LEVEL LOW
#define BUMPER_INPUT_MODE INPUT_PULLUP
const float VBAT_SCALE = (5.0f / 1023.0f) * ((100.0f + 33.0f) / 33.0f);
const uint8_t PIN_VBAT = A0;
#endif
#ifndef VBAT_WIRED
#define VBAT_WIRED 1
#endif
const float   VBAT_CAL = 1.000f;   // multimeter volts / reported volts, measured once

// ---- 3. Limits ----------------------------------------------------------------
const int16_t  MAX_PWM         = 200;     // never full power: a survey rover has no reason to hurry
const uint32_t MAX_RUN_MS      = 1500;    // one command moves the rover for at most this long
const uint32_t LINK_TIMEOUT_MS = 2000;
const uint32_t BATTERY_EVERY_MS = 1000;
// Set to -1 for a motor that turns the wrong way, instead of swapping its wires.
const int8_t   LEFT_DIR = 1, RIGHT_DIR = 1;

bool     running = false;
uint32_t runSeq = 0, runStartedAt = 0, runMs = 0;
uint32_t lastFrameAt = 0, lastBatteryAt = 0;
bool     runFromMqtt = false;   // a run started over Wi-Fi ends at once when Wi-Fi or the broker goes
bool     estopEngaged = false;  // from devices/rover-01/estop; refuses every run until released

char    rx[128];
uint8_t rxLen = 0;
bool    rxOverflow = false;

// ---- 4. Wi-Fi + MQTT (ESP32 with a secrets.h only) ---------------------------
// Copy secrets.h.example to secrets.h (git-ignored). Without it the board is USB-only,
// exactly as before. Same frames both ways: docs/architecture/rover-esp32.md.
#if defined(ARDUINO_ARCH_ESP32) && __has_include("secrets.h")
#define USE_WIFI 1
#include "secrets.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoOTA.h>
#ifndef MQTT_DRIVE
#define MQTT_DRIVE 0            // 1 = accept DRV over MQTT (build step 2). 0 = PING, STOP, e-stop only
#endif
const char* DEVICE_CODE = "ROVER-01";
const char* FW_VERSION  = "rover-mc-2.1.0";
const char* T_STATUS = "devices/rover-01/status";      // retained; last will = offline
const char* T_CMD    = "devices/rover-01/drive/cmd";   // frames in
const char* T_EVT    = "devices/rover-01/drive/evt";   // frames out
const char* T_ESTOP  = "devices/rover-01/estop";       // {"estop": true|false}, retained
const char* WILL     = "{\"status\":\"offline\",\"device\":\"ROVER-01\"}";
const uint16_t MQTT_KEEPALIVE_S = 5;                  // broker posts the will ~8 s after the rover goes
const uint32_t STATUS_EVERY_MS  = 30000;
WiFiClient   net;
PubSubClient mqtt(net);
uint32_t lastMqttTry = 0, lastStatusAt = 0;
uint32_t lastMqttSeq = 0;
bool     mqttHasSeq = false;
#else
#define USE_WIFI 0
#endif

void reply(const char* body) {
  char out[72];
  if (!drive::frame(out, sizeof out, body)) return;
  Serial.print(out);
#if USE_WIFI
  if (mqtt.connected()) mqtt.publish(T_EVT, out);
#endif
}

#if defined(ARDUINO_ARCH_ESP32)
// ---- ESP32: motor channels from a saved pin map ----------------------------------
// Up to 4 L298N channels, each driving the left or the right side. en = NO_PIN when the
// board's ENA/ENB jumper is left on: then the speed is PWM on the direction pins.
// The map is found with the wizard on Rover > Test and kept in flash ($MAP), so a
// rover wired differently needs no new firmware.
// Defaults: one ESP32 pin for every L298N pin, drawn in docs/hardware/rover-wiring.svg.
// The left board takes the ESP32's left pin row, the right board its right row, in
// order, so no wire crosses and no pin is split. None of them moves at boot.
#include <Preferences.h>
Channel channels[4] = {
  {'L', 32, 33, 25},   // front-left:  left L298N  OUT1/OUT2  ENA D32  IN1 D33  IN2 D25
  {'L', 13, 26, 27},   // rear-left:   left L298N  OUT3/OUT4  ENB D13  IN3 D26  IN4 D27
  {'R', 23, 22, 21},   // front-right: right L298N OUT1/OUT2  ENA D23  IN1 D22  IN2 D21
  {'R', 17, 19, 18},   // rear-right:  right L298N OUT3/OUT4  ENB TX2  IN3 D19  IN4 D18
};
bool mapSaved = false;
// GPIOs a pin probe may drive: outputs free at run time. Never 0, 1, 3 (boot button,
// USB serial), 6-11 (flash chip) or 34-39 (inputs only).
const uint8_t PROBE_PINS[] = { 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33 };
bool probing = false;

bool usable(uint8_t p) { for (uint8_t q : PROBE_PINS) if (q == p) return true; return false; }

void setChannel(const Channel& c, int16_t pwm) {
  if (!c.side) return;
  uint16_t duty = pwm >= 0 ? pwm : -pwm;
  if (c.en != NO_PIN) {
    analogWrite(c.en, 0);                         // enable off while the direction pins change
    digitalWrite(c.fwd, pwm > 0 ? HIGH : LOW);
    digitalWrite(c.back, pwm < 0 ? HIGH : LOW);
    analogWrite(c.en, duty);
  } else {                                        // jumper on: PWM on the pin for the way it turns
    analogWrite(c.fwd, pwm > 0 ? duty : 0);
    analogWrite(c.back, pwm < 0 ? duty : 0);
  }
}
void setSide(uint8_t side, int16_t pwm) { for (const Channel& c : channels) if (c.side == side) setChannel(c, pwm); }
void setLeft(int16_t pwm)  { setSide('L', pwm * LEFT_DIR); }
void setRight(int16_t pwm) { setSide('R', pwm * RIGHT_DIR); }
void setupMotorPins() {
  for (const Channel& c : channels) {
    if (!c.side) continue;
    const uint8_t pins[3] = { c.en, c.fwd, c.back };
    for (uint8_t p : pins) if (p != NO_PIN) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
  }
}
// Let go of every pin a probe or an old map may have used, then set up the map's pins.
void resetPins() {
  for (uint8_t p : PROBE_PINS) pinMode(p, INPUT);
  pinMode(PIN_BUMPER, BUMPER_INPUT_MODE);
  setupMotorPins();
  probing = false;
}
bool validMap(const Channel* m) {
  bool any = false;
  for (int i = 0; i < 4; i++) {
    if (!m[i].side) continue;
    if ((m[i].side != 'L' && m[i].side != 'R') || !usable(m[i].fwd) || !usable(m[i].back) || m[i].fwd == m[i].back
        || (m[i].en != NO_PIN && !usable(m[i].en))) return false;
    any = true;
  }
  return any;
}
void loadMap() {
  Preferences prefs;
  if (!prefs.begin("rover", true)) return;
  Channel m[4];
  if (prefs.getBytesLength("map") == sizeof m && prefs.getBytes("map", m, sizeof m) == sizeof m && validMap(m)) {
    memcpy(channels, m, sizeof m);
    mapSaved = true;
  }
  prefs.end();
}
void saveMap() {
  Preferences prefs;
  if (prefs.begin("rover", false)) { prefs.putBytes("map", channels, sizeof channels); prefs.end(); }
  mapSaved = true;
}
void pinSummary(char* out, size_t n) {            // "L:25,26,27;R:-,33,13"  (en,fwd,back; - = jumper)
  out[0] = '\0';
  for (const Channel& c : channels) {
    if (!c.side) continue;
    char part[24], en[4];
    if (c.en == NO_PIN) strcpy(en, "-"); else snprintf(en, sizeof en, "%u", c.en);
    snprintf(part, sizeof part, "%s%c:%s,%u,%u", out[0] ? ";" : "", c.side, en, c.fwd, c.back);
    strncat(out, part, n - strlen(out) - 1);
  }
}

void motorsOff() {
  if (probing) resetPins();
  setLeft(0);
  setRight(0);
}
#else
#if defined(DRIVER_L298N)
void setMotor(uint8_t en, uint8_t a, uint8_t b, int16_t pwm) {
  analogWrite(en, 0);                       // enable off while the direction pins change
  digitalWrite(a, pwm > 0 ? HIGH : LOW);
  digitalWrite(b, pwm < 0 ? HIGH : LOW);
  analogWrite(en, pwm >= 0 ? pwm : -pwm);
}
void setLeft(int16_t pwm)  { setMotor(PIN_ENA, PIN_IN1, PIN_IN2, pwm * LEFT_DIR); }
void setRight(int16_t pwm) { setMotor(PIN_ENB, PIN_IN3, PIN_IN4, pwm * RIGHT_DIR); }
void setupMotorPins() {
  pinMode(PIN_ENA, OUTPUT); pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_ENB, OUTPUT); pinMode(PIN_IN3, OUTPUT); pinMode(PIN_IN4, OUTPUT);
}
#else
// One input carries the PWM, the other stays low; both low = coast.
void setMotor(uint8_t ia, uint8_t ib, int16_t pwm) {
  analogWrite(ia, 0);
  analogWrite(ib, 0);
  digitalWrite(ia, LOW);
  digitalWrite(ib, LOW);
  if (pwm > 0) analogWrite(ia, pwm);
  else if (pwm < 0) analogWrite(ib, -pwm);
}
void setLeft(int16_t pwm)  { setMotor(PIN_A_IA, PIN_A_IB, pwm * LEFT_DIR); }
void setRight(int16_t pwm) { setMotor(PIN_B_IA, PIN_B_IB, pwm * RIGHT_DIR); }
void setupMotorPins() {
  pinMode(PIN_A_IA, OUTPUT); pinMode(PIN_A_IB, OUTPUT);
  pinMode(PIN_B_IA, OUTPUT); pinMode(PIN_B_IB, OUTPUT);
}
#endif

void motorsOff() {
  setLeft(0);
  setRight(0);
}
#endif

void endRun(const char* reason) {
  motorsOff();
  if (!running) return;
  running = false;
  char body[40];
  snprintf(body, sizeof body, "DONE,%lu,%s", (unsigned long)runSeq, reason);
  reply(body);
}

bool bumperPressed() { return digitalRead(PIN_BUMPER) == BUMPER_PRESSED_LEVEL; }

void ack(uint32_t seq) {
  char body[24];
  snprintf(body, sizeof body, "ACK,%lu", (unsigned long)seq);
  reply(body);
}

void nak(uint32_t seq, const char* why) {
  char body[40];
  snprintf(body, sizeof body, "NAK,%lu,%s", (unsigned long)seq, why);
  reply(body);
}

#if defined(ARDUINO_ARCH_ESP32)
#if USE_WIFI
void publishStatus();
#endif
// Wiring setup frames, sent by the wizard on Rover > Test:
//   $PIO,seq,mask,ms    exactly the GPIOs in hex `mask` HIGH, the other probe pins LOW, for at
//                       most 1.2 s: which wheel turns shows which pin goes where
//   $MAP,seq,S,en,fwd,back[,S,en,fwd,back]...   save up to 4 motor channels (S = L or R,
//                       en 255 = ENA/ENB jumper left on). Kept in flash across power cuts.
// Same rules as a move: refused under e-stop or with Wi-Fi driving off, and every probe
// ends by itself, on a lost link, or on STOP.
const uint32_t MAX_PROBE_MS = 1200;

bool frameOk(const char* text, char* body, size_t n) {
  const char* star = strrchr(text, '*');
  if (!star || text[0] != '$' || strlen(star) < 3) return false;
  size_t len = star - text - 1;
  if (len >= n) return false;
  memcpy(body, text + 1, len);
  body[len] = '\0';
  int hi = drive::hexval(star[1]), lo = drive::hexval(star[2]);
  return hi >= 0 && lo >= 0 && drive::checksum(body, len) == (uint8_t)(hi * 16 + lo);
}

void handleSetup(const char* text, bool fromMqtt) {
  char body[128];
  if (!frameOk(text, body, sizeof body)) { nak(0, "bad_checksum"); return; }
  lastFrameAt = millis();
  char* save = nullptr;
  char* kind = strtok_r(body, ",", &save);
  long seq;
  if (!drive::toLong(strtok_r(nullptr, ",", &save), 0, 0x7fffffffL, &seq)) { nak(0, "bad_frame"); return; }
#if USE_WIFI
  if (fromMqtt && !MQTT_DRIVE) { nak(seq, "mqtt_drive_off"); return; }
#endif
  if (estopEngaged) { nak(seq, "estop"); return; }

  if (strcmp(kind, "PIO") == 0) {
    char* masks = strtok_r(nullptr, ",", &save);
    long ms;
    if (!masks || !*masks || !drive::toLong(strtok_r(nullptr, ",", &save), 1, 60000, &ms)) { nak(seq, "bad_frame"); return; }
    char* end = nullptr;
    uint64_t mask = strtoull(masks, &end, 16);
    if (*end) { nak(seq, "bad_frame"); return; }
    uint64_t allowed = 0;
    for (uint8_t p : PROBE_PINS) allowed |= 1ULL << p;
    if (mask & ~allowed) { nak(seq, "bad_pin"); return; }
    if (running) endRun("replaced");
    ack(seq);
    setLeft(0);
    setRight(0);
    for (uint8_t p : PROBE_PINS) { pinMode(p, OUTPUT); digitalWrite(p, ((mask >> p) & 1) ? HIGH : LOW); }
    probing = true;
    running = true;
    runFromMqtt = fromMqtt;
    runSeq = seq;
    runStartedAt = millis();
    runMs = ms < (long)MAX_PROBE_MS ? ms : MAX_PROBE_MS;
  } else if (strcmp(kind, "MAP") == 0) {
    if (running) { nak(seq, "busy"); return; }
    Channel m[4] = { {0, NO_PIN, NO_PIN, NO_PIN}, {0, NO_PIN, NO_PIN, NO_PIN},
                     {0, NO_PIN, NO_PIN, NO_PIN}, {0, NO_PIN, NO_PIN, NO_PIN} };
    int n = 0;
    char* side;
    while ((side = strtok_r(nullptr, ",", &save)) != nullptr) {
      long en, fw, bk;
      if (n == 4 || strlen(side) != 1
          || !drive::toLong(strtok_r(nullptr, ",", &save), 0, 255, &en)
          || !drive::toLong(strtok_r(nullptr, ",", &save), 0, 39, &fw)
          || !drive::toLong(strtok_r(nullptr, ",", &save), 0, 39, &bk)) { nak(seq, "bad_frame"); return; }
      m[n++] = { (uint8_t)side[0], (uint8_t)en, (uint8_t)fw, (uint8_t)bk };
    }
    if (!validMap(m)) { nak(seq, "bad_map"); return; }
    memcpy(channels, m, sizeof m);
    saveMap();
    resetPins();
    motorsOff();
    ack(seq);
#if USE_WIFI
    if (mqtt.connected()) publishStatus();
#endif
  } else {
    nak(seq, "bad_frame");
  }
}
#endif

void handle(const char* text, bool fromMqtt = false) {
#if defined(ARDUINO_ARCH_ESP32)
  if (strncmp(text, "$PIO,", 5) == 0 || strncmp(text, "$MAP,", 5) == 0) { handleSetup(text, fromMqtt); return; }
#endif
  drive::Command c = drive::parse(text, MAX_PWM, MAX_RUN_MS);
  if (c.kind == drive::Kind::Invalid) {
    nak(0, c.error == drive::Error::BadChecksum ? "bad_checksum" : "bad_frame");
    return;
  }
  lastFrameAt = millis();

  switch (c.kind) {
    case drive::Kind::Stop:
      endRun("stopped");
      ack(c.seq);
      break;
    case drive::Kind::Ping:
      ack(c.seq);
      break;
    case drive::Kind::Drv:
#if USE_WIFI
      if (fromMqtt && !MQTT_DRIVE) { nak(c.seq, "mqtt_drive_off"); break; }
      // The same DRV twice (a retry after a lost ACK, or a duplicate delivery) is
      // acknowledged again but never run twice.
      if (fromMqtt && mqttHasSeq && c.seq == lastMqttSeq) { ack(c.seq); break; }
#endif
      if (estopEngaged) { nak(c.seq, "estop"); break; }
      if (bumperPressed()) { nak(c.seq, "bumper"); break; }
      if (running) endRun("replaced");
#if USE_WIFI
      if (fromMqtt) { lastMqttSeq = c.seq; mqttHasSeq = true; }
#endif
      ack(c.seq);
      runFromMqtt = fromMqtt;
      running = true;
      runSeq = c.seq;
      runStartedAt = millis();
      runMs = c.ms;
      setLeft(c.left);
      setRight(c.right);
      break;
    default:
      break;
  }
}

#if USE_WIFI
void publishStatus() {
  char msg[320], pins[100];
  pinSummary(pins, sizeof pins);
  snprintf(msg, sizeof msg,
           "{\"status\":\"online\",\"device\":\"%s\",\"fw\":\"%s\",\"link\":\"wifi\",\"ip\":\"%s\","
           "\"rssi\":%d,\"estop\":%s,\"mqttDrive\":%s,\"pins\":\"%s\",\"pinsSaved\":%s}",
           DEVICE_CODE, FW_VERSION, WiFi.localIP().toString().c_str(), (int)WiFi.RSSI(),
           estopEngaged ? "true" : "false", MQTT_DRIVE ? "true" : "false", pins, mapSaved ? "true" : "false");
  mqtt.publish(T_STATUS, msg, true);
  lastStatusAt = millis();
}

void onMqtt(char* topic, byte* payload, unsigned int len) {
  char text[128];
  if (len >= sizeof text) return;                 // too long to be ours: dropped whole
  memcpy(text, payload, len);
  text[len] = '\0';
  if (strcmp(topic, T_CMD) == 0) {
    handle(text, true);
  } else if (strcmp(topic, T_ESTOP) == 0) {
    bool engage = strstr(text, "true") != nullptr;
    if (engage && running) endRun("estop");
    if (engage != estopEngaged) { estopEngaged = engage; publishStatus(); }
  }
}

void netSetup() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);                    // the core reconnects in the background
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqtt);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(1);
  mqtt.setBufferSize(512);                        // status carries the pin map
#ifdef OTA_PASSWORD
  // Firmware over Wi-Fi: arduino-cli upload -p <rover ip> --upload-field password=<OTA_PASSWORD>.
  // The wheels are stopped first, and no move is accepted while it runs.
  ArduinoOTA.setHostname("rover-01");
  ArduinoOTA.setPassword(OTA_PASSWORD);
  ArduinoOTA.onStart([]() { endRun("update"); motorsOff(); estopEngaged = true; });
  ArduinoOTA.onError([](ota_error_t) { motorsOff(); ESP.restart(); });   // start clean, e-stop re-read from the broker
  ArduinoOTA.begin();
#endif
}

// Never blocks a run: a reconnect is only tried while the wheels are still, because
// connecting can take a second or more and the safety checks must keep running.
void netLoop() {
#ifdef OTA_PASSWORD
  if (!running) ArduinoOTA.handle();               // never while the wheels turn
#endif
  bool up = WiFi.status() == WL_CONNECTED && mqtt.connected();
  if (!up && running && runFromMqtt) endRun("link_lost");
  if (WiFi.status() != WL_CONNECTED) return;
  if (!mqtt.connected()) {
    if (running || millis() - lastMqttTry < 3000) return;
    lastMqttTry = millis();
    if (mqtt.connect(DEVICE_CODE, MQTT_USER, MQTT_PASSWORD, T_STATUS, 1, true, WILL)) {
      mqtt.subscribe(T_CMD, 0);
      mqtt.subscribe(T_ESTOP, 1);                 // retained: a reboot learns the e-stop at once
      publishStatus();
    }
    return;
  }
  mqtt.loop();
  if (millis() - lastStatusAt >= STATUS_EVERY_MS) publishStatus();
}
#endif

void setup() {
  // Motors off before anything else happens.
#if defined(ARDUINO_ARCH_ESP32)
  loadMap();
#endif
  setupMotorPins();
#if defined(ESP8266)
  analogWriteRange(255);     // same 0..255 PWM scale as the Nano, so the Pi needs no change
  analogWriteFreq(1000);
#endif
  motorsOff();
  pinMode(PIN_BUMPER, BUMPER_INPUT_MODE);
#if defined(ESP8266)
  WiFi.mode(WIFI_OFF);       // the link is USB serial; radio off saves power and noise
  WiFi.forceSleepBegin();
#endif
#if defined(ARDUINO_ARCH_ESP32)
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_VBAT, ADC_11db);   // 0..~3.1 V on the battery pin
#endif
  Serial.begin(115200);
  lastFrameAt = millis();
#if USE_WIFI
  netSetup();
#endif
}

void loop() {
  // 1. Safety first, independent of the serial link.
#if defined(ARDUINO_ARCH_ESP32)
  if (running && !probing && bumperPressed()) endRun("bumper");   // a probe may drive the bumper pin itself
#else
  if (running && bumperPressed()) endRun("bumper");
#endif
  if (running && millis() - runStartedAt >= runMs) endRun("elapsed");
  if (running && millis() - lastFrameAt >= LINK_TIMEOUT_MS) endRun("watchdog");
#if USE_WIFI
  netLoop();
#endif

  // 2. Commands. An over-long line is dropped whole, never half-parsed.
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\n') {
      rx[rxLen] = '\0';
      if (!rxOverflow && rxLen > 0) handle(rx);
      rxLen = 0;
      rxOverflow = false;
    } else if (rxLen < sizeof rx - 1) {
      rx[rxLen++] = ch;
    } else {
      rxOverflow = true;
    }
  }

  // 3. Battery, once a second.
  if (VBAT_WIRED && millis() - lastBatteryAt >= BATTERY_EVERY_MS) {
    lastBatteryAt = millis();
#if defined(ARDUINO_ARCH_ESP32)
    float volts = analogReadMilliVolts(PIN_VBAT) / 1000.0f * VBAT_DIVIDER;   // calibrated in eFuse
#else
    float volts = analogRead(PIN_VBAT) * VBAT_SCALE;
#endif
    char body[24];
    snprintf(body, sizeof body, "BAT,%lu", (unsigned long)(volts * VBAT_CAL * 1000.0f));
    reply(body);
  }
}
