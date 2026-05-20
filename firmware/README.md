# Firmware

PlatformIO firmware for M5StickC Plus2.

The controller is designed to run headless after setup: it boots, loads the saved WiFi and WebSocket
configuration, connects to the local hub at `/ws/device`, and streams telemetry. USB serial remains
the setup, recovery, and diagnostics path.

## Hardware And Tooling

- Hardware: M5StickC Plus2 with ESP32-PICO-V3-02.
- USB-UART: CH9102/WCH; install the CH9102/CP34X driver when the OS does not expose the serial port.
- Firmware build tool: PlatformIO installed inside the repo `.venv` with `uv`.
- PlatformIO environment: `espressif32@6.7.0`, `board = m5stick-c`, `framework = arduino`.
- Firmware libraries: `M5Unified`, `WebSockets`, and `ArduinoJson`.
- Serial baud rate: 115200.
- Upload speed: 1500000.

Create the local tool environment from the repo root:

```sh
uv venv --allow-existing .venv
uv pip install --python .venv/bin/python -r requirements-controller.txt
```

Use `.venv/bin/...` tools only. The official repo workflow does not rely on global `pio`, `python`,
or `esptool` commands.

## Build

```sh
bun run firmware:build
```

## Upload And Monitor

```sh
bun run firmware:upload
bun run firmware:monitor
```

When multiple serial devices are visible, pass the upload port directly to PlatformIO:

```sh
.venv/bin/pio run -d firmware -t upload --upload-port /dev/cu.usbserial-...
```

On macOS, prefer the CH9102/WCH `cu.usbserial...` device for upload and probing.

## Serial Setup

The firmware also streams `register`, `heartbeat`, `imu`, and `orientation` JSON frames over USB
serial at 115200 baud. This allows a USB-only hardware smoke test before WiFi is configured.

Send one newline-delimited JSON object over the serial monitor:

```json
{"type":"configure","ssid":"Network","password":"Secret","serverUrl":"ws://192.168.1.10:8787/ws/device","deviceId":"m5stick-plus2-001"}
```

The firmware responds with a newline-delimited `configureResult` object and stores the configuration in `Preferences`.

Run the browser-independent serial probe from the repo root:

```sh
bun run serial:probe -- --port /dev/cu.usbserial-... --baud 115200 --seconds 8
```

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

## Display

The built-in display is a headless status screen, not a control UI. It shows:

- device ID and IP address
- WiFi signal bars
- WebSocket link nodes
- streaming state
- battery level
- IMU horizon/orbit telemetry
- latest status or error message

The `identify` command temporarily switches the display into a high-contrast identify state while
keeping the same telemetry layout.
