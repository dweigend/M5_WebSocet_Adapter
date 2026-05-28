# M5StickC Plus2 WebSocket Adapter 🚀

This repo turns a M5StickC Plus2 into a small wireless controller for a local web app.
It is part of early controller experiments for the
[ICAROS project](https://github.com/dweigend/neural-flight-template).

The idea is friendly and practical:

1. Flash the M5StickC Plus2 firmware.
2. Connect the controller over USB once.
3. Save WiFi, hub URL, and a stable controller ID.
4. Let the controller stream IMU/orientation data over WebSocket.
5. Watch everything live in the SvelteKit diagnostics UI.

No cloud service, no account, no hidden magic. It is a local lab setup that you can understand,
break, fix, and extend.

## What Is Inside?

- `firmware/` contains the PlatformIO firmware for the M5StickC Plus2.
- `src/server/` contains the local Bun WebSocket hub.
- `src/routes/` contains the SvelteKit page shell.
- `src/lib/` contains browser-side protocol, transport, USB serial, state, and UI modules.
- `scripts/setup-controller-tui.py` starts the guided controller setup.
- `scripts/setup_controller/` contains the small Python modules behind that setup assistant.
- `docs/` contains protocol and hardware setup notes.

The adapter has three moving pieces:

- Firmware reads IMU telemetry and sends it to `/ws/device`.
- The Bun hub validates device messages and broadcasts state to `/ws/ui`.
- The SvelteKit UI configures or diagnoses the controller and visualizes live orientation data.

## Quick Start

Install the JavaScript dependencies:

```sh
bun install
```

Then run the guided setup:

```sh
bun run setup:controller
```

The setup assistant walks you through the whole path:

- installs or updates pinned controller tools with `uv`
- optionally uploads firmware
- detects or accepts a serial port
- creates stable computer and controller IDs
- asks for WiFi credentials without logging or storing the password
- chooses the local computer IP the controller should call back to
- sends the existing USB serial `configure` JSON frame
- checks the hub
- runs verification checks
- can start the Bun hub and SvelteKit UI

Local setup metadata is stored here:

```text
~/.config/m5-websocket-adapter/setup.json
```

That file may contain the computer ID, known controller IDs, default hub port, and the last SSID.
It must not contain WiFi passwords.

## Manual Runtime

If you want to run the parts yourself, use two terminals:

```sh
bun run server
```

```sh
bun run dev
```

Open:

```text
http://localhost:5173/
```

The hub listens on `127.0.0.1:8787` by default. The controller needs a LAN-reachable URL such as:

```text
ws://192.168.1.10:8787/ws/device
```

Use `HOST=0.0.0.0 bun run server` only when a controller on the local network must reach this
computer directly.

## Why USB First?

USB is the safe setup and recovery path. WiFi is the normal runtime path.

The firmware mirrors `register`, `heartbeat`, `imu`, and `orientation` frames over USB serial at
115200 baud. That means you can verify the hardware before WiFi is working. Once WiFi is configured,
the controller can run headlessly and stream to the local hub.

The browser UI also has a **Connect via USB** path using Web Serial. The Python setup assistant is
the calmer option when you want a guided terminal workflow.

## Useful Commands

Controller setup:

```sh
bun run setup:controller
```

Serial diagnostics:

```sh
bun run serial:probe -- --port /dev/cu.usbserial-... --baud 115200 --seconds 8
```

Simulated device telemetry:

```sh
bun run simulate:device
```

Integration harness:

```sh
bun run verify:integration
```

Firmware:

```sh
bun run firmware:build
bun run firmware:upload
bun run firmware:monitor
```

## Verification Checklist

Before publishing or handing in changes, run the checks. Yes, it is a few commands; future-you will
be happy. 🙂

```sh
bun run python:format
bun run python:lint
bun run python:typecheck
bun run lint
bun run check
bun run build
bun run test
bun run firmware:build
```

`bun run test` runs the Vitest unit suite and the Bun integration harness. The integration harness
checks telemetry broadcast, command forwarding, and reconnect handoff.

## Tooling Notes

The repo uses `uv` as the Python project manager. Python dependencies live in `pyproject.toml`:

- base project dependencies: `pyserial` and `websockets`
- `dev` group: `ruff` and `ty`
- `firmware` group: `platformio` and `esptool`

The package scripts run Python, PlatformIO, Ruff, Ty, pySerial, and websockets through normal
project-aware `uv run` commands:

```sh
uv run ...
uv run --group dev ...
uv run --group firmware ...
```

You can pre-create and sync the local `.venv` cache:

```sh
bun run tools:setup
```

You should still prefer the `bun run ...` scripts instead of global `pio`, `python`, or `esptool`.
That keeps everyone on the same versions from `pyproject.toml` and `uv.lock`.

## Controller Stack

- Hardware: M5StickC Plus2 with ESP32-PICO-V3-02.
- USB-UART: CH9102/WCH.
- Serial baud rate: 115200.
- Upload speed: 1500000.
- PlatformIO platform: `espressif32@6.7.0`.
- Board: `m5stick-c`.
- Framework: Arduino.
- Firmware libraries: `M5Unified`, `WebSockets`, and `ArduinoJson`.

If your OS does not show the serial port, install or reinstall the CH9102/CP34X driver.
On macOS, prefer a `/dev/cu.usbserial...` device.

## Protocol

All messages are JSON. USB setup uses newline-delimited JSON; WebSocket runtime traffic uses the
same message shapes without the trailing newline.

The setup assistant sends:

```json
{
  "type": "configure",
  "ssid": "Network",
  "password": "Secret",
  "serverUrl": "ws://192.168.1.10:8787/ws/device",
  "deviceId": "m5stick-plus2-001"
}
```

The firmware answers:

```json
{
  "type": "configureResult",
  "ok": true,
  "message": "Configuration saved"
}
```

For the full protocol, read [docs/protocol.md](./docs/protocol.md).

## Student Map

Start here if you are learning the project:

1. Read this README.
2. Run `bun run setup:controller` once and watch what it asks.
3. Read [docs/controller-setup.md](./docs/controller-setup.md) when hardware or serial ports are confusing.
4. Read [docs/protocol.md](./docs/protocol.md) when you want to understand the JSON messages.
5. Look at [src/server/hub.ts](./src/server/hub.ts) to see how device and UI WebSockets meet.
6. Look at [scripts/setup_controller/flow.py](./scripts/setup_controller/flow.py) to see the setup flow in small Python steps.

## Project Rules

- Keep code, file names, commit messages, pull requests, and code comments in English.
- Prefer small, readable changes over clever abstractions.
- Use libraries for protocol-heavy work when a solid library exists.
- Never store WiFi passwords in logs or config files.
- Run the verification checklist before publishing changes.

## Publishing Checklist

- MIT license is included.
- No real WiFi credentials, device secrets, generated logs, `.venv`, `.pio`, or build output are staged.
- Verification commands pass.
- GitHub Actions passes on `main` after pushing.

## License

MIT
