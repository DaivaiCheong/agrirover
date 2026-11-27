// ============================================================================
// AGRIROVER — MOTOR CONTROLLER  (ESP8266 NodeMCU / Wemos D1 mini, or Arduino Nano / Uno)
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
#endif
const uint8_t PIN_VBAT = A0;
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

char    rx[64];
uint8_t rxLen = 0;
bool    rxOverflow = false;

void reply(const char* body) {
  char out[72];
  if (drive::frame(out, sizeof out, body)) Serial.print(out);
}

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

void handle(const char* text) {
  char body[40];
  drive::Command c = drive::parse(text, MAX_PWM, MAX_RUN_MS);
  if (c.kind == drive::Kind::Invalid) {
    snprintf(body, sizeof body, "NAK,0,%s",
             c.error == drive::Error::BadChecksum ? "bad_checksum" : "bad_frame");
    reply(body);
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
      if (bumperPressed()) {
        snprintf(body, sizeof body, "NAK,%lu,bumper", (unsigned long)c.seq);
        reply(body);
        break;
      }
      if (running) endRun("replaced");
      ack(c.seq);
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

void setup() {
  // Motors off before anything else happens.
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
  Serial.begin(115200);
  lastFrameAt = millis();
}

void loop() {
  // 1. Safety first, independent of the serial link.
  if (running && bumperPressed()) endRun("bumper");
  if (running && millis() - runStartedAt >= runMs) endRun("elapsed");
  if (running && millis() - lastFrameAt >= LINK_TIMEOUT_MS) endRun("watchdog");

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
  if (millis() - lastBatteryAt >= BATTERY_EVERY_MS) {
    lastBatteryAt = millis();
    char body[24];
    snprintf(body, sizeof body, "BAT,%lu",
             (unsigned long)(analogRead(PIN_VBAT) * VBAT_SCALE * VBAT_CAL * 1000.0f));
    reply(body);
  }
}
