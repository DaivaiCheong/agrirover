// ============================================================================
// AgriRover — drive protocol (firmware side)
//
// Pure C++: no Arduino headers, no heap. Compiled into the motor-controller
// sketch and, unchanged, into test/test_drive_protocol.cpp on a PC, so the
// parser that guards the motors is tested without hardware.
//
// Frames are NMEA style:  $BODY*XX   XX = XOR of BODY bytes, upper-case hex.
// The Pi side is edge/rover-agent/rover/protocol.py; both test the same vectors.
// ============================================================================
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

namespace drive {

enum class Kind : uint8_t { Invalid, Drv, Stop, Ping };
enum class Error : uint8_t { None, BadFrame, BadChecksum };

struct Command {
  Kind kind = Kind::Invalid;
  Error error = Error::BadFrame;
  uint32_t seq = 0;
  int16_t left = 0;     // PWM, + = forward
  int16_t right = 0;
  uint32_t ms = 0;      // already clamped to the caller's limit
};

inline uint8_t checksum(const char* s, size_t n) {
  uint8_t c = 0;
  for (size_t i = 0; i < n; i++) c ^= (uint8_t)s[i];
  return c;
}

inline int hexval(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

// Whole-field integer parse: rejects empty fields, trailing junk and overflow.
inline bool toLong(const char* s, long lo, long hi, long* out) {
  if (!s || !*s) return false;
  char* end = nullptr;
  long v = strtol(s, &end, 10);
  if (*end != '\0' || v < lo || v > hi) return false;
  *out = v;
  return true;
}

// Parse one received line (with or without the trailing newline).
// PWM is clamped to +/-maxPwm and duration to maxMs: a command can ask for
// less than the firmware allows, never more.
inline Command parse(const char* line, int16_t maxPwm, uint32_t maxMs) {
  Command cmd;
  size_t n = strlen(line);
  while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) n--;
  if (n < 4 || line[0] != '$') return cmd;

  const char* star = (const char*)memchr(line, '*', n);
  if (!star || (size_t)((line + n) - star) != 3) return cmd;      // exactly "*XX" at the end
  int hi = hexval(star[1]), lo = hexval(star[2]);
  if (hi < 0 || lo < 0) return cmd;
  size_t bodyLen = (size_t)(star - (line + 1));
  if (checksum(line + 1, bodyLen) != (uint8_t)(hi * 16 + lo)) {
    cmd.error = Error::BadChecksum;
    return cmd;
  }

  char buf[64];
  if (bodyLen == 0 || bodyLen >= sizeof buf) return cmd;
  memcpy(buf, line + 1, bodyLen);
  buf[bodyLen] = '\0';

  char* field[6];
  int nf = 0;
  field[nf++] = buf;
  for (char* p = buf; *p; p++) {
    if (*p == ',') {
      if (nf == 6) return cmd;                                     // too many fields
      *p = '\0';
      field[nf++] = p + 1;
    }
  }

  long seq;
  if (nf < 2 || !toLong(field[1], 0, 0x7FFFFFFFL, &seq)) return cmd;
  cmd.seq = (uint32_t)seq;

  if (strcmp(field[0], "DRV") == 0 && nf == 5) {
    long l, r, ms;
    if (!toLong(field[2], -32768, 32767, &l) || !toLong(field[3], -32768, 32767, &r) ||
        !toLong(field[4], 1, 0x7FFFFFFFL, &ms)) return cmd;
    if (l > maxPwm) l = maxPwm;
    if (l < -maxPwm) l = -maxPwm;
    if (r > maxPwm) r = maxPwm;
    if (r < -maxPwm) r = -maxPwm;
    cmd.left = (int16_t)l;
    cmd.right = (int16_t)r;
    cmd.ms = (uint32_t)ms < maxMs ? (uint32_t)ms : maxMs;
    cmd.kind = Kind::Drv;
  } else if (strcmp(field[0], "STOP") == 0 && nf == 2) {
    cmd.kind = Kind::Stop;
  } else if (strcmp(field[0], "PING") == 0 && nf == 2) {
    cmd.kind = Kind::Ping;
  } else {
    return cmd;
  }
  cmd.error = Error::None;
  return cmd;
}

// Wrap a body as a complete frame "$BODY*XX\n". Returns length, 0 if it does not fit.
inline size_t frame(char* out, size_t cap, const char* body) {
  size_t n = strlen(body);
  if (n + 6 > cap) return 0;
  static const char kHex[] = "0123456789ABCDEF";   // not "HEX": Arduino defines that macro
  uint8_t c = checksum(body, n);
  out[0] = '$';
  memcpy(out + 1, body, n);
  out[n + 1] = '*';
  out[n + 2] = kHex[c >> 4];
  out[n + 3] = kHex[c & 0x0F];
  out[n + 4] = '\n';
  out[n + 5] = '\0';
  return n + 5;
}

}  // namespace drive
