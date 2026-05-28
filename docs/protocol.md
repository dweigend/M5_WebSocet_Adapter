# Protocol Reference

All runtime messages are JSON. Firmware setup over USB serial uses one newline-delimited JSON object
per line. WebSocket runtime traffic uses the same message shapes without the trailing newline.

## Serial Setup

The UI sends configuration to the controller over USB serial:

```json
{
  "type": "configure",
  "ssid": "Network",
  "password": "Secret",
  "serverUrl": "ws://192.168.1.10:8787/ws/device",
  "deviceId": "m5stick-plus2-001"
}
```

The firmware answers with:

```json
{
  "type": "configureResult",
  "ok": true,
  "message": "Configuration saved"
}
```

## Device To Hub

Every device frame includes:

- `deviceId`: stable controller name
- `role`: currently always `controller`
- `seq`: increasing sequence number
- `timeMs`: firmware uptime timestamp
- `quality`: value from `0` to `1`

The firmware may emit fewer mirrored USB serial telemetry frames than WebSocket telemetry frames.
That is intentional: USB serial is a diagnostics channel, while WebSocket is the primary runtime
transport. The JSON shapes stay the same so the UI and probe can parse both paths with the same
validators.

Register frame:

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

Heartbeat frame:

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

IMU frame:

```json
{
  "type": "imu",
  "deviceId": "m5stick-plus2-001",
  "role": "controller",
  "seq": 3,
  "timeMs": 3020,
  "accel": { "x": 0.01, "y": 0.02, "z": 0.98 },
  "gyro": { "x": 0.1, "y": 0.2, "z": 0 },
  "quality": 1
}
```

Orientation frame:

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

## UI To Device Commands

The UI sends commands to the hub with a target `deviceId`:

```json
{ "type": "identify", "deviceId": "m5stick-plus2-001" }
```

The hub forwards only the command frame to the device:

```json
{ "type": "identify" }
```

Supported commands:

- `calibrate`
- `pause`
- `resume`
- `identify`
- `reboot`

## Runtime URLs

The hub exposes two WebSocket paths:

- `/ws/device`: firmware connects here and sends device frames.
- `/ws/ui`: browser UI connects here and receives snapshots and updates.

The setup assistant derives all runtime URLs from one selected host/port pair:

```text
host_ip = 192.168.1.10
hub_port = 8787
serverUrl = ws://192.168.1.10:8787/ws/device
hub UI URL = ws://localhost:8787/ws/ui
hub health URL = http://127.0.0.1:8787/health
```

The controller receives the LAN URL because it runs on another device. The setup assistant and the
browser can use localhost URLs because they run on the computer that starts the hub.
