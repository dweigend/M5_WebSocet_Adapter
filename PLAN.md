# M5StickC Plus2 WebSocket Adapter Plan

## Summary

Build an independent project in `/Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter`.

The goal is a local adapter where a M5StickC Plus2 streams IMU and orientation telemetry to a Bun WebSocket server. A SvelteKit UI configures the device over Web Serial and visualizes live orientation data with Three.js.

V1 stays local, simple, and testable:

- No cloud service.
- No authentication.
- No new backend framework abstraction.
- No direct VR control.

The server is the local authority. The M5Stick is a sensor appliance. Future VR or Neural Flight clients should consume only validated server-side control data.

## Architecture

### Firmware

- Target: M5Stack StickC Plus2.
- Build: PlatformIO with Arduino framework.
- Hardware library: `M5Unified`.
- Network: `WiFi.h` from the ESP32 Arduino stack.
- WebSocket: `arduinoWebSockets`.
- JSON: `ArduinoJson`.
- Persistent config: `Preferences`.
- Tooling: `uv` creates `.venv`; firmware commands use `.venv/bin/pio`.

Firmware responsibilities:

- Read accelerometer and gyroscope data.
- Derive basic pitch, roll, and yaw orientation for V1.
- Send `register`, `heartbeat`, `imu`, and `orientation` messages.
- Receive `calibrate`, `pause`, `resume`, `reboot`, and `identify` commands.
- Keep `M5.update()` and `webSocket.loop()` running frequently.
- Handle WiFi reconnect and WebSocket reconnect separately.
- Avoid blocking delays in normal operation.

### Server

- Runtime: Bun.
- WebSocket implementation: Bun-native `Bun.serve`.
- Device endpoint: `/ws/device`.
- UI endpoint: `/ws/ui`.

Server responsibilities:

- Validate incoming JSON messages.
- Maintain device state.
- Track sequence numbers, stale data, packet loss estimate, heartbeat age, and safe-mode status.
- Broadcast valid device telemetry and status to UI clients.
- Forward UI commands to connected devices.

### UI

- Framework: SvelteKit with Svelte 5.
- Runner/package manager: Bun.
- Styling: central `src/app.css`.
- Visualization: Three.js.
- Icons: Lucide where useful.

UI responsibilities:

- Configure the Stick over Web Serial.
- Show device connection, calibration, RSSI, heap, battery, packet loss, and last-message age.
- Visualize orientation with a Three.js Stick model.
- Send commands: calibrate, pause, resume, identify, reboot.
- Clearly show unsupported Web Serial browsers.

## Protocol

All wire messages are JSON. Serial setup uses newline-delimited JSON.

### Serial Setup

UI to firmware:

```json
{
  "type": "configure",
  "ssid": "Network",
  "password": "Secret",
  "serverUrl": "ws://192.168.1.10:8787/ws/device",
  "deviceId": "m5stick-plus2-001"
}
```

Firmware to UI:

```json
{
  "type": "configureResult",
  "ok": true,
  "message": "Configuration saved"
}
```

### Device To Server

`register`:

```json
{
  "type": "register",
  "deviceId": "m5stick-plus2-001",
  "role": "controller",
  "seq": 1,
  "timeMs": 1000,
  "firmwareVersion": "0.1.0",
  "capabilities": ["imu", "orientation"],
  "quality": 1
}
```

`heartbeat`:

```json
{
  "type": "heartbeat",
  "deviceId": "m5stick-plus2-001",
  "role": "controller",
  "seq": 2,
  "timeMs": 3000,
  "rssi": -55,
  "freeHeap": 123456,
  "batteryVoltage": 4.01,
  "uptimeMs": 3000,
  "calibrated": true,
  "streaming": true,
  "quality": 1
}
```

`imu`:

```json
{
  "type": "imu",
  "deviceId": "m5stick-plus2-001",
  "role": "controller",
  "seq": 3,
  "timeMs": 3020,
  "accel": { "x": 0.01, "y": 0.02, "z": 0.98 },
  "gyro": { "x": 0.1, "y": 0.2, "z": 0.0 },
  "quality": 1
}
```

`orientation`:

```json
{
  "type": "orientation",
  "deviceId": "m5stick-plus2-001",
  "role": "controller",
  "seq": 4,
  "timeMs": 3040,
  "pitch": 1.2,
  "roll": -2.4,
  "yaw": 0.3,
  "quality": 1
}
```

### Server To Device

```json
{ "type": "calibrate" }
```

```json
{ "type": "pause" }
```

```json
{ "type": "resume" }
```

```json
{ "type": "identify" }
```

```json
{ "type": "reboot" }
```

## Success Metrics

- Setup: Web Serial configuration can be saved in under 60 seconds.
- Connection: after saved config, the Stick connects to WiFi and WebSocket within 10 seconds.
- Telemetry: stable IMU rate is at least 30 Hz, with 50 Hz as target.
- Heartbeat: heartbeat is sent every 2 seconds.
- UI latency: orientation data appears in the browser typically within 100 ms after server receipt.
- Fault detection: WiFi or server outage is visible in firmware/UI status within 3 seconds.
- Recovery: after server restart, the Stick reconnects within 10 seconds.
- Checks: `bun run lint`, `bun run check`, `bun run build`, `bun run test`, and `bun run firmware:build` pass where tooling is available.

## Implementation Boundaries

- Keep firmware, server/protocol, and UI work separated.
- Do not mix rendering, networking, state validation, and firmware setup logic.
- Add dependencies only when the existing stack cannot solve the problem cleanly.
- Prefer Bun-native WebSockets for V1.
- Prefer readable, typed protocol code over clever generic abstractions.
