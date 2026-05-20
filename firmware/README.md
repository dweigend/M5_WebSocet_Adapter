# Firmware

PlatformIO firmware for M5StickC Plus2.

## Build

```sh
cd firmware
pio run
```

During the 2026-05-20 integration session, `pio` was not available in `PATH`, so the firmware build
could not be verified locally in this environment.

## Upload And Monitor

```sh
cd firmware
pio run --target upload
pio device monitor --baud 115200
```

## Serial Setup

Send one newline-delimited JSON object over the serial monitor:

```json
{"type":"configure","ssid":"Network","password":"Secret","serverUrl":"ws://192.168.1.10:8787/ws/device","deviceId":"m5stick-plus2-001"}
```

The firmware responds with a newline-delimited `configureResult` object and stores the configuration in `Preferences`.

## Runtime Protocol

The firmware sends `register`, `heartbeat`, `imu`, and `orientation` JSON frames to the configured
WebSocket URL. The local hub expects the device endpoint at `/ws/device`.

The firmware accepts these command frames from the hub:

```json
{"type":"calibrate"}
{"type":"pause"}
{"type":"resume"}
{"type":"identify"}
{"type":"reboot"}
```
