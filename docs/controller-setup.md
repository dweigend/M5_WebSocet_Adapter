# Controller Setup 🚀

This repo treats the M5StickC Plus2 controller setup as part of the project contract. The normal
runtime is headless WiFi/WebSocket telemetry; USB serial is for setup, recovery, and diagnostics.

## Required Stack

- M5StickC Plus2 with ESP32-PICO-V3-02.
- CH9102/WCH USB-UART driver when the host OS does not expose the serial port.
- Bun for the local WebSocket hub and SvelteKit UI.
- uv for Python, PlatformIO, and esptool tooling.
- PlatformIO environment from `firmware/platformio.ini`:
  - `platform = espressif32@6.7.0`
  - `board = m5stick-c`
  - `framework = arduino`
  - `upload_speed = 1500000`
  - `monitor_speed = 115200`
- Firmware libraries:
  - `m5stack/M5Unified`
  - `links2004/WebSockets`
  - `bblanchon/ArduinoJson`

## Tool Installation

Run from the repo root:

```sh
bun install
bun run setup:controller
```

The guided setup assistant can install the pinned Python/controller tools with `uv`, upload firmware,
send the serial configuration, run checks, and start the local hub and UI. Tool versions are declared
in `pyproject.toml` and locked by `uv.lock`.

If you only want to warm up the Python tool cache, run:

```sh
bun run tools:setup
```

Still prefer the `bun run ...` scripts below. They call project-aware `uv run` commands, so nobody
has to rely on global `pio`, `python`, or `esptool`.

## Firmware Workflow

```sh
bun run firmware:build
bun run firmware:upload
bun run firmware:monitor
```

When the host has multiple serial devices, upload with the explicit CH9102/WCH port:

```sh
uv run --group firmware pio run -d firmware -t upload --upload-port /dev/cu.usbserial-...
```

## Headless Runtime

The easiest path is:

```sh
bun run setup:controller
```

For a fully manual run:

1. Upload firmware with `bun run firmware:upload`.
2. Start the local hub:

   ```sh
   bun run server
   ```

3. Use the setup assistant or the UI once over USB serial to save WiFi, WebSocket URL, and device ID.
4. Reboot the controller.
5. The controller connects to WiFi, opens the configured WebSocket URL, and streams telemetry to
   `/ws/device`.
6. The UI connects to `/ws/ui` and observes telemetry through the hub.

## Diagnostics

USB serial emits the same `register`, `heartbeat`, `imu`, and `orientation` frames at 115200 baud.
Use the local probe when the browser is not enough:

```sh
bun run serial:probe -- --port /dev/cu.usbserial-... --baud 115200 --seconds 8
```

The local probe is useful when the browser cannot access Web Serial or when you want to confirm that
the flashed firmware emits JSON frames independently of the UI.

## Troubleshooting

- **No serial port appears:** install or reinstall the CH9102/CP34X driver, reconnect the device,
  and prefer a `cu.usbserial...` port on macOS.
- **The port opens but no JSON frames arrive:** flash the project firmware first; factory firmware
  does not emit this repo's telemetry protocol.
- **The browser crashes or closes while selecting a port:** close other serial/Bluetooth tools,
  reconnect the device, reinstall the CH9102/CP34X driver, and retry in a current Chromium browser.
- **The UI says the hub is offline:** start the hub with `bun run server`; USB diagnostics can still
  work while the hub is offline.
- **Multiple serial devices are listed:** use the CH9102/WCH device, not unrelated USB CDC devices.
- **The setup assistant asks for a computer IP:** choose the LAN IP that the controller can reach,
  not `127.0.0.1`, unless you are only doing a local hub smoke test.
