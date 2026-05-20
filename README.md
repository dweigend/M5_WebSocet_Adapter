# M5StickC Plus2 WebSocket Adapter

This project coordinates a local WebSocket adapter for a M5Stack StickC Plus2.

The adapter has three parts:

- A M5StickC Plus2 firmware that reads IMU telemetry and sends it over WebSocket.
- A local Bun WebSocket hub that validates device messages and broadcasts state.
- A SvelteKit test and setup UI that configures the device over Web Serial and visualizes live orientation data with Three.js.

## Source Of Truth

- [PLAN.md](./PLAN.md) defines the architecture, protocol, success metrics, and implementation boundaries.
- [TODO.md](./TODO.md) defines the work packages, ownership, dependencies, and acceptance criteria.
- [SESSION_PROMPTS.md](./SESSION_PROMPTS.md) contains ready-to-use prompts for separate implementation sessions.

All implementation sessions must read these files before editing code.

## V1 Scope

- Local development only.
- No cloud service.
- No authentication.
- No VR or Neural Flight integration yet.
- Web Serial is the setup mechanism for WiFi, WebSocket URL, and device ID.

## Local Setup

Install dependencies:

```sh
bun install
```

Run the SvelteKit UI:

```sh
bun run dev
```

Open the UI and connect the Stick over USB:

```text
http://localhost:5173/
```

The **Connect via USB** button uses Web Serial. The browser must ask for permission at least once,
but the chooser is filtered to likely M5/WCH serial devices and already-granted ports are reused
automatically. With the project firmware installed, USB telemetry works without WiFi, SSID, or
password; the device appears as `m5stick-plus2-usb` until a configured device ID is saved.

By default, the UI connects to `ws://<current-host>:8787/ws/ui`. Override the hub connection with
`PUBLIC_M5_HUB_PORT=8788 bun run dev`, `PUBLIC_M5_HUB_URL=ws://127.0.0.1:8788/ws/ui bun run dev`,
or a browser URL such as `http://localhost:5173/?hubPort=8788`.

Run the Bun WebSocket hub in a second terminal:

```sh
bun run server
```

Send simulated device telemetry to the hub:

```sh
bun run simulate:device
```

Run the integration harness for telemetry broadcast and command forwarding:

```sh
bun run verify:integration
```

Run verification checks:

```sh
bun run lint
bun run check
bun run build
bun run test
```

`bun run test` runs the Vitest unit suite and then the Bun integration harness so the WebSocket hub
telemetry happy path and command forwarding are covered in the regular test command.

## Firmware

Build the M5StickC Plus2 firmware:

```sh
cd firmware
pio run
```

Upload the firmware:

```sh
cd firmware
pio run --target upload
```

Open the serial monitor:

```sh
cd firmware
pio device monitor --baud 115200
```

If `pio` is not installed, the firmware cannot be verified locally from this checkout. During the
2026-05-20 integration session, PlatformIO was not available in `PATH`, so `pio run` was not run.

The firmware mirrors `register`, `heartbeat`, `imu`, and `orientation` JSON frames to USB serial as
well as WebSocket. This makes the first hardware check USB-first: flash the firmware, open the UI,
click **Connect via USB**, and live IMU data should appear without configuring WiFi.

## Coordination Rules

- Keep server/protocol, firmware, and UI work in separate sessions when possible.
- Do not edit another session's ownership area unless the integration session requires it.
- Keep code, file names, commit messages, pull requests, and code comments in English.
- Chat with the user in German.
- Run the checks listed in [TODO.md](./TODO.md) before considering a package complete.
