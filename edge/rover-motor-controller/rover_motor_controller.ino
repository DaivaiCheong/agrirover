// ============================================================================
// AGRIROVER — MOTOR CONTROLLER  (Arduino Nano / Uno)
// One Utilities Cambodia · AgriRover
//
// Drives the two wheel motors for the rover's Raspberry Pi over USB serial.
// Protocol: drive_protocol.h (firmware) / rover/protocol.py (Pi).
//
// SAFETY — the reason this logic lives here and not on the Pi
//   * every run is clamped to MAX_RUN_MS and MAX_PWM, whatever the Pi asks for
//   * no valid frame for LINK_TIMEOUT_MS while moving  -> motors off
//   * bumper pressed -> motors off at once; new runs refused while it is held
//   * at power-up both motors are off before anything else happens
//   The Pi can only ever ask for less than these limits, never more.
//
// WIRING  (L298N or TB6612FNG dual H-bridge)
//   left motor   ENA <- D5 (PWM)   IN1 <- D7   IN2 <- D8
//   right motor  ENB <- D6 (PWM)   IN3 <- D9   IN4 <- D10
//   bumper switch  D2 -> GND (internal pull-up, pressed = LOW)
//   battery divider 100k / 33k -> A0   (3S pack: 12.6 V -> 3.1 V)
//   motor supply from the pack; grounds common with the Arduino
// ============================================================================
#include "drive_protocol.h"

const uint8_t PIN_ENA = 5, PIN_IN1 = 7, PIN_IN2 = 8;
const uint8_t PIN_ENB = 6, PIN_IN3 = 9, PIN_IN4 = 10;
const uint8_t PIN_BUMPER = 2;
const uint8_t PIN_VBAT = A0;

const int16_t  MAX_PWM         = 200;     // never full power: a survey rover has no reason to hurry
const uint32_t MAX_RUN_MS      = 1500;    // one command moves the rover for at most this long
const uint32_t LINK_TIMEOUT_MS = 2000;
const uint32_t BATTERY_EVERY_MS = 1000;
const float    VBAT_SCALE = (5.0f / 1023.0f) * ((100.0f + 33.0f) / 33.0f);   // ADC -> volts

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

void setMotor(uint8_t en, uint8_t a, uint8_t b, int16_t pwm) {
  digitalWrite(a, pwm > 0 ? HIGH : LOW);
  digitalWrite(b, pwm < 0 ? HIGH : LOW);
  analogWrite(en, pwm >= 0 ? pwm : -pwm);
}

void motorsOff() {
  setMotor(PIN_ENA, PIN_IN1, PIN_IN2, 0);
  setMotor(PIN_ENB, PIN_IN3, PIN_IN4, 0);
}

void endRun(const char* reason) {
  motorsOff();
  if (!running) return;
  running = false;
  char body[40];
  snprintf(body, sizeof body, "DONE,%lu,%s", (unsigned long)runSeq, reason);
  reply(body);
}

bool bumperPressed() { return digitalRead(PIN_BUMPER) == LOW; }

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
      setMotor(PIN_ENA, PIN_IN1, PIN_IN2, c.left);
      setMotor(PIN_ENB, PIN_IN3, PIN_IN4, c.right);
      break;
    default:
      break;
  }
}

void setup() {
  // Motors off before anything else happens.
  pinMode(PIN_ENA, OUTPUT); pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_ENB, OUTPUT); pinMode(PIN_IN3, OUTPUT); pinMode(PIN_IN4, OUTPUT);
  motorsOff();
  pinMode(PIN_BUMPER, INPUT_PULLUP);
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
    snprintf(body, sizeof body, "BAT,%lu", (unsigned long)(analogRead(PIN_VBAT) * VBAT_SCALE * 1000.0f));
    reply(body);
  }
}
