# Firmware

PlatformIO firmware for M5StickC Plus2.

## Build

```sh
cd firmware
pio run
```

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
