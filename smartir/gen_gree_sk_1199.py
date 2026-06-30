#!/usr/bin/env python3
"""
SmartIR code generator for Gree SK air conditioner (Broadlink RM Pro).

Reverse-engineered from stored Broadlink IR codes on HA (remote.rm_pro_remote).
Generates /config/custom_components/smartir/codes/climate/1199.json

Protocol: 16-byte data + 7-bit checksum, LSB-first per byte.

Byte layout:
  [0]  0x06 | (fan<<4) | (mode<<6)
  [1]  (temp-16) << 4
  [2]  0x00
  [3]  0x00
  [4]  0x33  (swing/display flags, fixed)
  [5]  0x00 (power on) / 0xC0 (power off)
  [6-9]  0x00
  [10] byte[5] >> 4   (0x00 = on, 0x0C = off)
  [11-15] 0x00
  checksum (7 bits, bit 7 is the terminal long-gap mark):
    = (byte[0]>>4) + (byte[0]&0xF) + (byte[1]>>4) + (byte[1]&0xF)
    max value = 33 < 128, so bit 7 is always 0 (covered by end-of-frame gap)

Mode (bits 7-6 of byte 0): Auto=0, Cool=1, Dry=2, Fan=3
Fan  (bits 5-4 of byte 0): Auto=0, Low=1, Medium=2, High=3

Timing constants (extracted from stored Broadlink codes, 32.84 µs/tick):
  Header: 276 / 140 ticks
  Bit mark: 17 ticks  |  Zero space: 18 ticks  |  One space: 53 ticks

Verified: OFF code at 23°C Cool Fan-Low — all 16 data bytes and 7-bit
  checksum (0x12) match the stored Broadlink code exactly.
"""
import base64, struct, json, sys

HDR_MARK   = 276
HDR_SPACE  = 140
BIT_MARK   = 17
ZERO_SPACE = 18
ONE_SPACE  = 53


def _enc(v):
    return bytes([0, v >> 8 & 0xFF, v & 0xFF]) if v > 255 else bytes([v & 0xFF])


def _to_broadlink(timings):
    data = b''.join(_enc(t) for t in timings)
    hdr  = bytes([0x26, 0x00]) + struct.pack('<H', len(data))
    return base64.b64encode(hdr + data + bytes([0x0D, 0x05])).decode()


def _checksum(data_bytes):
    b0, b1 = data_bytes[0], data_bytes[1]
    return (b0 >> 4) + (b0 & 0xF) + (b1 >> 4) + (b1 & 0xF)


def _build_timings(data_bytes):
    t = [HDR_MARK, HDR_SPACE]
    for b in data_bytes:
        for bp in range(8):
            t += [BIT_MARK, ONE_SPACE if (b >> bp) & 1 else ZERO_SPACE]
    # 7-bit checksum (bit 7 always 0 → covered by the terminal mark+gap below)
    chk = _checksum(data_bytes)
    for bp in range(7):
        t += [BIT_MARK, ONE_SPACE if (chk >> bp) & 1 else ZERO_SPACE]
    t += [BIT_MARK, 0]
    return t


def gree_sk_bytes(temp, mode, fan, power_on=True):
    b5  = 0x00 if power_on else 0xC0
    b10 = b5 >> 4
    return [0x06 | (fan << 4) | (mode << 6), (temp - 16) << 4,
            0x00, 0x00, 0x33, b5, 0x00, 0x00,
            0x00, 0x00, b10, 0x00, 0x00, 0x00, 0x00, 0x00]


def gree_sk_code(temp, mode, fan, power_on=True):
    return _to_broadlink(_build_timings(gree_sk_bytes(temp, mode, fan, power_on)))


MODES = {'auto': 0, 'cool': 1, 'dry': 2, 'fan_only': 3}
FANS  = {'auto': 0, 'low': 1, 'medium': 2, 'high': 3}


def generate(output_path='/tmp/1199.json'):
    commands = {'off': gree_sk_code(23, 1, 1, False)}
    for mn, mv in MODES.items():
        commands[mn] = {}
        for fn, fv in FANS.items():
            commands[mn][fn] = {str(t): gree_sk_code(t, mv, fv) for t in range(16, 31)}

    smartir = {
        'manufacturer': 'Gree',
        'supportedModels': ['SK'],
        'supportedController': 'BroadlinkIP',
        'commandsEncoding': 'Base64',
        'minTemperature': 16,
        'maxTemperature': 30,
        'precision': 1,
        'operationModes': list(MODES),
        'fanModes': list(FANS),
        'commands': commands,
    }
    with open(output_path, 'w') as f:
        json.dump(smartir, f, indent=2)
    print(f"Wrote {output_path}  ({len(json.dumps(smartir))} bytes, "
          f"{1 + len(MODES)*len(FANS)*15} codes)")


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/1199.json'
    generate(out)
