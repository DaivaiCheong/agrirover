// AgriRover motor controller: one L298N channel of the ESP32's saved pin map.
// A header of its own so the Arduino builder's generated prototypes can see the type.
#pragma once
#include <stdint.h>

const uint8_t NO_PIN = 255;
struct Channel { uint8_t side, en, fwd, back; };   // side 'L' or 'R'; 0 = unused. en NO_PIN = jumper on
