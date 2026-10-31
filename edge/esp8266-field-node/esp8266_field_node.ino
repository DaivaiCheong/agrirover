// ============================================================================
// AI AUTO FARM — ESP8266 FIELD NODE
// Kirirom Institute of Technology · B11-P01 · Daivai Cheong
//
// One node does all field I/O for a plot:
//   sensing   soil moisture, water pH, rain, supply voltage
//   actuation 4-channel relay bank (inlet solenoid, solar pump, spare, spare)
//
// WHY AN EXTERNAL ADC
//   The ESP8266 has exactly one analog input (A0) but this system needs two
//   analog channels — soil moisture AND water pH. An ADS1115 (4-channel, 16-bit,
//   I2C) resolves that, and its higher resolution also improves the pH reading.
//   Without it you would need a second ESP8266 or an analog multiplexer.
//
// WIRING
//   ADS1115  SDA -> D2 (GPIO4)   SCL -> D1 (GPIO5)   ADDR -> GND (0x48)
//     A0 <- pH probe (PH-4502C Po, through its divider)
//     A1 <- capacitive soil moisture probe
//     A2 <- supply voltage divider (solar / battery rail)
//   Rain sensor DO -> D7 (GPIO13)
//   4-channel relay module (opto-isolated, active LOW, JD-VCC jumper ON):
//     IN1 <- D5 (GPIO14)  channel 1  inlet solenoid  12 V, own supply
//     IN2 <- D6 (GPIO12)  channel 2  pump 6 V, solar
//     IN3 <- D0 (GPIO16)  channel 3  reserved: pH dosing  (not installed)
//     IN4 <- D8 (GPIO15)  channel 4  spare               (not installed)
//
// SAFETY — the reason this logic lives here and not in the server
//   Every relay run is clamped to MAX_RUN_MS in firmware. If the Raspberry Pi
//   crashes, the network drops, or a command arrives corrupted, the channel
//   still closes. Nothing upstream can hold water on the plot.
//
// Libraries: PubSubClient (Nick O'Leary), Adafruit_ADS1X15, ArduinoJson
// Board: NodeMCU 1.0 (ESP-12E)
// ============================================================================

#include "secrets.h"          // copy secrets.h.example -> secrets.h
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <ArduinoJson.h>

// ---------------- identity ----------------
const char* DEVICE_CODE = "ESP-FIELD-01";
const char* FARM_ID     = "farm-01";
const char* ZONE_ID     = "zone-a";
const char* FW_VERSION  = "field-node-1.0.0";

// ---------------- pins ----------------
const uint8_t PIN_RAIN     = D7;
const uint8_t RELAY_PIN[4] = { D5, D6, D0, D8 };
const bool    RELAY_ACTIVE_LOW = true;
const bool    RAIN_ACTIVE_LOW  = true;   // most boards pull DO LOW when wet

const uint8_t CH_SOLENOID = 0;           // channel 1
const uint8_t CH_PUMP     = 1;           // channel 2

// ---------------- safety ----------------
const unsigned long MAX_RUN_MS[4] = { 90000UL, 90000UL, 10000UL, 10000UL };
unsigned long channelStartedAt[4] = { 0, 0, 0, 0 };
bool          channelOn[4]        = { false, false, false, false };
// A commanded run may be SHORTER than the hardware limit, never longer.
unsigned long runBudget[4]        = { 0, 0, 0, 0 };

// ---------------- sensing ----------------
Adafruit_ADS1115 ads;
const uint8_t  ADC_PH     = 0;
const uint8_t  ADC_SOIL   = 1;
const uint8_t  ADC_SUPPLY = 2;
const uint8_t  SAMPLES    = 24;          // averaged on-device before publishing

// Soil calibration — measure yours: probe in air (dry) and in water (wet).
float SOIL_V_DRY = 2.80f;
float SOIL_V_WET = 1.20f;

// pH two-point calibration. PH_CALIBRATED stays false until BOTH are measured
// with real buffer solutions; until then every reading is published with
// quality "uncalibrated" and is stored as evidence, not as a measurement.
float PH_V_AT_7 = 2.766f;
float PH_V_AT_4 = 0.0f;
const bool PH_CALIBRATED = false;

// ---------------- timing ----------------
const unsigned long PUBLISH_MS   = 60000UL;
const unsigned long HEARTBEAT_MS = 30000UL;
unsigned long lastPublish = 0, lastHeartbeat = 0, lastReconnect = 0;

WiFiClient   net;
PubSubClient mqtt(net);
char topicTelemetry[96], topicValveSet[96], topicValveState[96], topicStatus[96];

// ============================ helpers ============================
float adcVolts(uint8_t ch) {
  long acc = 0;
  for (uint8_t i = 0; i < SAMPLES; i++) { acc += ads.readADC_SingleEnded(ch); delay(4); }
  return ads.computeVolts(acc / (int32_t)SAMPLES);
}

float soilPercent(float v) {
  float pct = (SOIL_V_DRY - v) / (SOIL_V_DRY - SOIL_V_WET) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

float phFromVolts(float v) {
  if (!PH_CALIBRATED || PH_V_AT_4 == 0.0f) return 7.0f + (v - PH_V_AT_7) * -5.7f; // nominal slope
  float slope = (7.0f - 4.0f) / (PH_V_AT_7 - PH_V_AT_4);
  return 7.0f + (v - PH_V_AT_7) * slope;
}

bool rainDetected() {
  int r = digitalRead(PIN_RAIN);
  return RAIN_ACTIVE_LOW ? (r == LOW) : (r == HIGH);
}

void applyRelay(uint8_t ch, bool on) {
  digitalWrite(RELAY_PIN[ch], RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
  channelOn[ch] = on;
  if (on) channelStartedAt[ch] = millis();
}

void publishValveState(uint8_t ch, const char* reason, const char* requestId) {
  StaticJsonDocument<256> d;
  d["channel"]  = ch + 1;
  d["state"]    = channelOn[ch] ? "ON" : "OFF";
  d["reason"]   = reason;
  d["device"]   = DEVICE_CODE;
  d["uptimeMs"] = millis();
  if (requestId) d["requestId"] = requestId;
  char buf[256]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicValveState, (uint8_t*)buf, n, true);   // retained: it is a state
}

void setChannel(uint8_t ch, bool on, const char* reason, const char* requestId) {
  applyRelay(ch, on);
  publishValveState(ch, reason, requestId);
}

// The interlock. Runs every loop, answers to nobody upstream.
void enforceRunLimits() {
  for (uint8_t ch = 0; ch < 4; ch++) {
    if (channelOn[ch] && (millis() - channelStartedAt[ch]) >= MAX_RUN_MS[ch]) {
      setChannel(ch, false, "local_failsafe_max_on", nullptr);
    }
  }
}

// ============================ mqtt ============================
void onMessage(char* topic, byte* payload, unsigned int len) {
  if (strcmp(topic, topicValveSet) != 0) return;

  StaticJsonDocument<256> d;
  if (deserializeJson(d, payload, len)) return;             // malformed: ignore

  const char* cmd = d["command"]   | "";
  uint8_t ch      = (uint8_t)(d["channel"] | 1) - 1;
  unsigned long ms= d["maxOnMs"]   | 30000UL;
  const char* rid = d["requestId"] | (const char*)nullptr;
  if (ch > 3) return;

  bool on = (strcmp(cmd, "ON") == 0);
  if (on) {
    // Never accept a longer run than this channel's hardware limit.
    runBudget[ch] = min(ms, MAX_RUN_MS[ch]);
  }
  setChannel(ch, on, "remote_command", rid);
}

void enforceCommandBudget() {
  for (uint8_t ch = 0; ch < 4; ch++) {
    if (channelOn[ch] && runBudget[ch] > 0 &&
        (millis() - channelStartedAt[ch]) >= runBudget[ch]) {
      runBudget[ch] = 0;
      setChannel(ch, false, "run_budget_elapsed", nullptr);
    }
  }
}

void connectMQTT() {
  if (millis() - lastReconnect < 5000) return;
  lastReconnect = millis();
  String cid = String("aaf-") + DEVICE_CODE + "-" + String(ESP.getChipId(), HEX);
  if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASSWORD,
                   topicStatus, 1, true, "{\"status\":\"offline\"}")) {
    mqtt.subscribe(topicValveSet, 1);
    mqtt.publish(topicStatus, "{\"status\":\"online\"}", true);
    for (uint8_t ch = 0; ch < 4; ch++) publishValveState(ch, "boot", nullptr);
  }
}

void publishTelemetry() {
  float vPh   = adcVolts(ADC_PH);
  float vSoil = adcVolts(ADC_SOIL);
  float vSup  = adcVolts(ADC_SUPPLY) * 2.0f;      // divider ratio

  StaticJsonDocument<384> d;
  d["device"]      = DEVICE_CODE;
  d["fw"]          = FW_VERSION;
  d["sampleCount"] = SAMPLES;
  d["rssi"]        = WiFi.RSSI();
  JsonArray m = d.createNestedArray("measurements");

  JsonObject a = m.createNestedObject();
  a["metric"] = "soil_moisture"; a["value"] = soilPercent(vSoil);
  a["unit"] = "pct";  a["quality"] = "valid";

  JsonObject b = m.createNestedObject();
  b["metric"] = "water_ph";      b["value"] = phFromVolts(vPh);
  b["unit"] = "pH";   b["quality"] = PH_CALIBRATED ? "valid" : "uncalibrated";

  JsonObject c = m.createNestedObject();
  c["metric"] = "rain";          c["value"] = rainDetected() ? 1 : 0;
  c["unit"] = "bool"; c["quality"] = "valid";

  JsonObject e = m.createNestedObject();
  e["metric"] = "supply_voltage";e["value"] = vSup;
  e["unit"] = "V";    e["quality"] = "valid";

  char buf[384]; size_t n = serializeJson(d, buf);
  mqtt.publish(topicTelemetry, (uint8_t*)buf, n, false);
}

// ============================ setup / loop ============================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_RAIN, INPUT);
  for (uint8_t i = 0; i < 4; i++) { pinMode(RELAY_PIN[i], OUTPUT); applyRelay(i, false); }
  // All relays de-energised at power-on, before anything else happens.

  Wire.begin(D2, D1);
  if (!ads.begin()) Serial.println(F("ADS1115 not found — check I2C wiring"));
  ads.setGain(GAIN_ONE);                                    // +/- 4.096 V

  snprintf(topicTelemetry,  sizeof(topicTelemetry),  "farm/%s/zone/%s/telemetry",   FARM_ID, ZONE_ID);
  snprintf(topicValveSet,   sizeof(topicValveSet),   "farm/%s/zone/%s/valve/set",   FARM_ID, ZONE_ID);
  snprintf(topicValveState, sizeof(topicValveState), "farm/%s/zone/%s/valve/state", FARM_ID, ZONE_ID);
  snprintf(topicStatus,     sizeof(topicStatus),     "farm/%s/device/%s/status",    FARM_ID, DEVICE_CODE);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(512);

  Serial.println(F("AI Auto Farm field node ready."));
}

void loop() {
  // Safety first, and independent of the network.
  enforceRunLimits();
  enforceCommandBudget();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) connectMQTT();
    mqtt.loop();

    if (millis() - lastPublish >= PUBLISH_MS) { publishTelemetry(); lastPublish = millis(); }
    if (millis() - lastHeartbeat >= HEARTBEAT_MS) {
      mqtt.publish(topicStatus, "{\"status\":\"online\"}", true);
      lastHeartbeat = millis();
    }
  }
}
