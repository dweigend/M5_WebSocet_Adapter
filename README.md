# M5StickC Plus2 WebSocket Adapter

This project coordinates a local WebSocket adapter for a M5Stack StickC Plus2.

The adapter has three parts:

- A M5StickC Plus2 firmware that reads IMU telemetry and sends it over WiFi/WebSocket.
- A local Bun WebSocket hub that validates device messages and broadcasts state.
- A SvelteKit setup and diagnostics UI that configures the device over Web Serial and visualizes live orientation data with Three.js.

## Student Guide

Start here if you are learning how the project works:

- This README gives the quick start and the main runtime flow.
- [docs/controller-setup.md](./docs/controller-setup.md) explains hardware setup and troubleshooting.
- [PLAN.md](./PLAN.md) is the architecture and protocol reference.
- [TODO.md](./TODO.md) and [SESSION_PROMPTS.md](./SESSION_PROMPTS.md) are maintainer notes.

## V1 Scope

- Local development only.
- No cloud service.
- No authentication.
- No VR or Neural Flight integration yet.
- Web Serial is the setup mechanism for WiFi, WebSocket URL, and device ID.
- Headless WiFi/WebSocket operation is the primary runtime mode.
- USB serial remains the setup, recovery, and diagnostics path.

## Local Setup

Install dependencies:

```sh
bun install
```

Install controller tooling with uv:

```sh
uv venv --allow-existing .venv
uv pip install --python .venv/bin/python -r requirements-controller.txt
```

The project intentionally uses the `.venv` tools for firmware and Python diagnostics. Do not rely on
global `pio`, `python`, or `esptool` commands when following the repo instructions.

Run the SvelteKit UI:

```sh
bun run dev
```

Run the Bun WebSocket hub in a second terminal:

```sh
bun run server
```

Open the UI:

```text
http://localhost:5173/
```

The normal controller runtime is headless:

1. Flash the firmware.
2. Connect over USB once and save WiFi, WebSocket URL, and device ID.
3. Start the local hub with `bun run server`.
4. Reboot the controller; it connects to WiFi and streams to `/ws/device`.
5. Use the UI to observe telemetry through `/ws/ui`.

The **Connect via USB** button uses Web Serial. The browser must ask for permission at least once,
but the chooser is filtered to likely M5/WCH serial devices and already-granted ports are reused
automatically. With the project firmware installed, USB telemetry works without WiFi, SSID, or
password; the device appears as `m5stick-plus2-usb` until a configured device ID is saved.
The USB test mode keeps a raw serial console, parsed frame counters, invalid-line diagnostics, a
telemetry-rate estimate, and feeds valid frames into the same live visualization used for hub data.
USB is for setup, recovery, and diagnostics; WiFi/WebSocket is the intended operating path.

By default, the UI connects to `ws://<current-host>:8787/ws/ui`. Override the hub connection with
`PUBLIC_M5_HUB_PORT=8788 bun run dev`, `PUBLIC_M5_HUB_URL=ws://127.0.0.1:8788/ws/ui bun run dev`,
or a browser URL such as `http://localhost:5173/?hubPort=8788`.

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

## Controller Stack

The controller setup is part of the repo contract:

- Hardware: M5StickC Plus2 with ESP32-PICO-V3-02.
- USB-UART: CH9102/WCH; install the CH9102/CP34X driver when the OS does not expose the serial port.
- Firmware build tool: PlatformIO installed inside `.venv` with `uv`.
- PlatformIO environment: `espressif32@6.7.0`, `board = m5stick-c`, `framework = arduino`.
- Firmware libraries: `M5Unified`, `WebSockets`, and `ArduinoJson`.
- Serial baud rate: 115200.
- Upload speed: 1500000.

The pinned controller tooling is stored in `requirements-controller.txt`.

The firmware display is a local status surface only. It shows device ID, WiFi/IP, WebSocket,
streaming, battery, and the latest status/error message. The controller is still designed to run
headless after setup.

## Firmware

Build the M5StickC Plus2 firmware:

```sh
bun run firmware:build
```

Upload the firmware:

```sh
bun run firmware:upload
```

Open the serial monitor:

```sh
bun run firmware:monitor
```

Run the browser-independent serial probe:

```sh
bun run serial:probe -- --port /dev/cu.usbserial-... --baud 115200 --seconds 8
```

The firmware mirrors `register`, `heartbeat`, `imu`, and `orientation` JSON frames to USB serial as
well as WebSocket. This makes the first hardware check USB-first: flash the firmware, open the UI,
click **Connect via USB**, and live IMU data should appear without configuring WiFi.

## Coordination Rules

- Keep server/protocol, firmware, and UI work in separate sessions when possible.
- Do not edit another session's ownership area unless the integration session requires it.
- Keep code, file names, commit messages, pull requests, and code comments in English.
- Chat with the user in German.
- Run the checks listed in [TODO.md](./TODO.md) before considering a package complete.
