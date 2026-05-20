# USB Serial Diagnostic Report

Date: 2026-05-20

## Goal

Systematically identify the connected M5StickC Plus2 USB serial device, read any available data
independently of the browser, verify the bootloader/tooling path, and record every finding.

## Documentation Grounding

- M5StickC Plus2 uses ESP32-PICO-V3-02 and CH9102 USB-UART.
- M5Stack documents PlatformIO `monitor_speed = 115200`.
- M5Stack provides CH9102/CP34X drivers for macOS.
- M5Stack notes that macOS can show multiple ports and the CH9102/WCH port must be selected.
- M5Stack recommends reinstalling the CH9102 driver for upload timeouts or `Failed to write to target RAM`.

Sources:

- https://docs.m5stack.com/en/core/M5StickC%20PLUS2
- https://docs.m5stack.com/en/arduino/m5stickc_plus2/program
- https://docs.m5stack.com/en/download
- https://docs.m5stack.com/en/guide/restore_factory/m5stickc_plus2

## Local Environment

- Host: macOS 26.4.1, Darwin 25.4.0, arm64
- Repository: `/Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter`
- Browser serial session: closed before the latest probes

## Tooling Plan

- Use a project-local `.venv`.
- Install tools with `uv`.
- Run local tools through `.venv/bin/...`.
- Keep generated probe logs out of Git via `serial-probe-logs/`.

## USB Device Inventory

Observed serial device paths:

```text
/dev/cu.usbserial-5B212393021
/dev/tty.usbserial-5B212393021
/dev/cu.usbmodem11301
/dev/tty.usbmodem11301
```

The CH9102/WCH candidate is:

```text
/dev/cu.usbserial-5B212393021
```

macOS I/O Registry details:

```text
USB Product Name = USB Single Serial
idVendor = 6790  -> 0x1a86
idProduct = 21972 -> 0x55d4
USB Serial Number = 5B21239302
IOCalloutDevice = /dev/cu.usbserial-5B212393021
IODialinDevice = /dev/tty.usbserial-5B212393021
```

The other USB serial-looking path is not the M5StickC Plus2:

```text
/dev/cu.usbmodem11301
```

Registry context identified it as a `DEFY` / `DYGMA` USB CDC device.

## Browser-Independent Serial Probe Results

Script:

```text
scripts/probe-m5stick-serial.py
```

M5 CH9102 port at 115200 baud:

```sh
python3 scripts/probe-m5stick-serial.py --port /dev/cu.usbserial-5B212393021 --baud 115200 --seconds 8
```

Result:

```text
Bytes read: 0
Lines read: 0
JSON lines: 0
Device frames: 0
```

M5 CH9102 port at 115200 baud with diagnostic probes:

```sh
python3 scripts/probe-m5stick-serial.py --port /dev/cu.usbserial-5B212393021 --baud 115200 --seconds 8 --write-probes
```

Result:

```text
Bytes read: 0
Lines read: 0
JSON lines: 0
Device frames: 0
```

Earlier baud scan across `115200`, `9600`, `57600`, `38400`, `19200`, and `230400` also returned
0 bytes on the M5 CH9102 port.

## Current Working Hypothesis

The operating system sees the CH9102 USB-UART correctly, but the ESP32 application currently emits
no USB serial data. This points away from the browser UI and toward firmware, boot/power state, or
upload/bootloader verification.

## Next Steps

1. Install local tooling with `uv` in `.venv`. Done.
2. Use local `esptool` to query the ESP32 bootloader through the CH9102 port. Done.
3. Use local PlatformIO to build the firmware. Done.
4. If bootloader access succeeds, flash the project firmware. Done.
5. Re-run the serial probe and expect newline-delimited JSON frames. Done.

## Local Tool Installation

Commands:

```sh
uv venv .venv
uv pip install --python .venv/bin/python esptool platformio
```

Installed local tools:

```text
esptool v5.2.0
PlatformIO Core 6.1.19
```

Note: an earlier `uv tool install esptool` was run before switching to the project-local `.venv`
per operator instruction. All subsequent work uses `.venv/bin/...`.

## Bootloader Verification

Command:

```sh
.venv/bin/esptool --chip esp32 --port /dev/cu.usbserial-5B212393021 --baud 115200 chip-id
```

Result:

```text
Connected to ESP32 on /dev/cu.usbserial-5B212393021
Chip type: ESP32-PICO-V3-02 (revision v3.1)
Features: Wi-Fi, BT, Dual Core + LP Core, 240MHz, Embedded Flash, Embedded PSRAM
Crystal frequency: 40MHz
MAC: 00:4b:12:c4:bc:30
Hard resetting via RTS pin
```

Conclusion: CH9102, cable, driver, port selection, and auto-reset into bootloader are functional.

## Firmware Build

Command:

```sh
.venv/bin/pio run -d firmware
```

Result:

```text
SUCCESS
RAM:   15.3% (used 50040 bytes from 327680 bytes)
Flash: 85.2% (used 1116977 bytes from 1310720 bytes)
```

Warnings:

- ArduinoJson 7 deprecates `StaticJsonDocument` and `createNestedObject/createNestedArray`.
- The warnings do not block the build.

## Firmware Upload

Command:

```sh
.venv/bin/pio run -d firmware -t upload --upload-port /dev/cu.usbserial-5B212393021
```

Result:

```text
SUCCESS
Chip type: ESP32-PICO-V3-02 (revision v3.1)
MAC: 00:4b:12:c4:bc:30
Compressed 1116977 bytes to 722718
Hash of data verified
Hard resetting via RTS pin
```

Conclusion: flashing through the same CH9102 port works. The local PlatformIO path is healthy.

## Post-Flash Serial Probe

Command:

```sh
.venv/bin/python scripts/probe-m5stick-serial.py --port /dev/cu.usbserial-5B212393021 --baud 115200 --seconds 12
```

Result:

```text
Bytes read: 133600
Lines read: 747
JSON lines: 745
Device frames: 745
Invalid text lines: 2
```

Frame types observed:

- `imu`
- `orientation`
- `heartbeat`

Representative frames:

```json
{"type":"imu","deviceId":"m5stick-plus2-usb","role":"controller","seq":1119,"timeMs":18639,"quality":1,"accel":{"x":-0.352988,"y":0.044461,"z":0.837784},"gyro":{"x":-139.5874,"y":-4.089355,"z":407.2266}}
{"type":"orientation","deviceId":"m5stick-plus2-usb","role":"controller","seq":1120,"timeMs":18660,"quality":1,"pitch":2.799896,"roll":22.84742,"yaw":54.17114}
{"type":"heartbeat","deviceId":"m5stick-plus2-usb","role":"controller","seq":5598,"timeMs":90795,"quality":1,"rssi":0,"freeHeap":234500,"batteryVoltage":4.196,"uptimeMs":90795,"calibrated":false,"streaming":true}
```

The two invalid text lines were partial first/last capture fragments caused by attaching/detaching
the script in the middle of an active newline-delimited stream. They are not firmware protocol
errors.

## Probe With Diagnostic Writes

Command:

```sh
.venv/bin/python scripts/probe-m5stick-serial.py --port /dev/cu.usbserial-5B212393021 --baud 115200 --seconds 4 --write-probes
```

Result:

```text
Bytes read: 53709
Lines read: 302
JSON lines: 300
Device frames: 300
Invalid text lines: 2
```

Additional observations:

- A leading blank diagnostic line produced `configureResult` with `Invalid JSON`.
- `statusRequest`, `getConfig`, and `startTelemetry` currently produce `configureResult` with
  `Unsupported setup message`.
- Live telemetry continues while unsupported setup probes are received.

## Final Diagnosis

The USB device path and macOS driver were not the blocker. The correct device is
`/dev/cu.usbserial-5B212393021`, a CH9102/WCH USB-UART connected to an ESP32-PICO-V3-02. Before
the project firmware was flashed, the application emitted no serial bytes. After flashing the
project firmware, the same port immediately produced high-rate newline-delimited JSON telemetry.

Root cause for the browser symptom: the Stick was selectable through Web Serial, but it was not
running the project firmware that emits the expected JSON telemetry protocol.

## Browser Follow-Up

The browser should now receive the same `imu`, `orientation`, and `heartbeat` frames after selecting
`USB Single Serial (cu.usbserial-5B212393021)`. If the UI still reports only invalid JSON after this
flash, the next investigation should focus on Web Serial stream framing and command writes, not
USB device discovery or the OS driver.

Local page smoke test:

```text
http://localhost:5173 loaded successfully.
Observed console issue: WebSocket connection to ws://localhost:8787/ws/ui was refused because the
local hub server was not running.
```

This does not block USB test mode. Web Serial selection still requires a user gesture in the
browser, so the port handoff must be verified manually in the UI.

## Local Verification

Commands:

```sh
.venv/bin/python -m py_compile scripts/probe-m5stick-serial.py
.venv/bin/pio run -d firmware
bun run lint
bun run check
bun run build
bun run test
```

Results:

```text
Python compile: passed
PlatformIO firmware build: passed
Biome lint: passed
svelte-check: passed, 0 errors and 0 warnings
Vite build: passed
Vitest/integration test: passed, 6 test files, 27 tests
```

Notes:

- `bun run lint` initially failed because Biome scanned the local `.venv` created for USB tooling.
  `biome.json` and `.gitignore` now exclude `.venv`, `firmware/.pio`, and serial probe logs.
- `bun run build` still emits the existing large-chunk advisory for the main Svelte page. It is a
  warning, not a failed build.
