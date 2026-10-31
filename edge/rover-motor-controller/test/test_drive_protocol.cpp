// Host test for drive_protocol.h — no Arduino needed.
//   g++ -std=c++11 -Wall -Wextra -Werror -I.. test_drive_protocol.cpp -o t && ./t
// Vectors match edge/rover-agent/tests/test_protocol.py.
#include <stdio.h>
#include "../drive_protocol.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { printf("FAIL line %d: %s\n", __LINE__, #cond); failures++; } } while (0)

int main() {
  using namespace drive;
  const int16_t MAX_PWM = 200;
  const uint32_t MAX_MS = 1500;

  // valid drive command, clamped duration
  Command c = parse("$DRV,7,150,150,1200*74\n", MAX_PWM, MAX_MS);
  CHECK(c.kind == Kind::Drv && c.error == Error::None);
  CHECK(c.seq == 7 && c.left == 150 && c.right == 150 && c.ms == 1200);

  // over-limit PWM and duration are clamped, never obeyed
  c = parse("$DRV,8,-300,300,5000*50", MAX_PWM, MAX_MS);
  CHECK(c.kind == Kind::Drv && c.left == -200 && c.right == 200 && c.ms == 1500);

  CHECK(parse("$STOP,9*0D", MAX_PWM, MAX_MS).kind == Kind::Stop);
  CHECK(parse("$PING,10*3D\r\n", MAX_PWM, MAX_MS).kind == Kind::Ping);

  // corrupted payload: checksum no longer matches
  c = parse("$DRV,7,150,150,9200*74", MAX_PWM, MAX_MS);
  CHECK(c.kind == Kind::Invalid && c.error == Error::BadChecksum);

  // malformed frames
  const char* bad[] = {"", "DRV,1*00", "$DRV,1", "$*00", "$DRV,7,150,150,1200*7",
                       "$DRV,7,150,150,1200*7G", "$DRV,7,150,150*00", "$DRV,7,1x0,150,1200*00"};
  for (const char* line : bad) CHECK(parse(line, MAX_PWM, MAX_MS).kind == Kind::Invalid);

  // well-formed checksum but invalid content: zero / negative duration, unknown verb, extra fields
  char buf[64];
  frame(buf, sizeof buf, "DRV,1,100,100,0");
  CHECK(parse(buf, MAX_PWM, MAX_MS).kind == Kind::Invalid);
  frame(buf, sizeof buf, "DRV,1,100,100,-5");
  CHECK(parse(buf, MAX_PWM, MAX_MS).kind == Kind::Invalid);
  frame(buf, sizeof buf, "JUMP,1");
  CHECK(parse(buf, MAX_PWM, MAX_MS).kind == Kind::Invalid);
  frame(buf, sizeof buf, "DRV,1,1,1,1,1,1");
  CHECK(parse(buf, MAX_PWM, MAX_MS).kind == Kind::Invalid);

  // replies are framed identically to the Python side
  CHECK(frame(buf, sizeof buf, "ACK,7") > 0 && strcmp(buf, "$ACK,7*52\n") == 0);
  CHECK(frame(buf, sizeof buf, "DONE,7,elapsed") > 0 && strcmp(buf, "$DONE,7,elapsed*5D\n") == 0);
  CHECK(frame(buf, 8, "DONE,7,elapsed") == 0);    // does not overflow a short buffer

  if (failures) { printf("%d failure(s)\n", failures); return 1; }
  printf("drive_protocol: all checks passed\n");
  return 0;
}
