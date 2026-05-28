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

The setup assistant is also the reference implementation for runtime configuration:

- It picks a hub port before the hub starts.
- It picks a UI port before Vite starts.
- It asks which LAN IP the controller can reach.
- It derives the controller WebSocket URL, UI URL, and hub health URL from those choices.
- It passes the same hub port to the Bun hub and the SvelteKit UI.

That single decision point is deliberate. It avoids a common distributed-systems trap: one process
quietly moves to a new port while another process still talks to the old one.

For a fully manual run:

1. Upload firmware with `bun run firmware:upload`.
2. Start the local hub on an explicit port:

   ```sh
   HOST=0.0.0.0 PORT=8787 bun run server
   ```

3. Start the UI with the same hub port and the host IP the controller should use:

   ```sh
   PUBLIC_M5_HUB_PORT=8787 PUBLIC_M5_DEVICE_HOST=192.168.1.10 bun run dev -- --host 0.0.0.0 --port 5173
   ```

4. Use the setup assistant or the UI once over USB serial to save WiFi, WebSocket URL, and device ID.
5. Reboot the controller.
6. The controller connects to WiFi, opens the configured WebSocket URL, and streams telemetry to
   `/ws/device`.
7. The UI connects to `/ws/ui` and observes telemetry through the hub.

If a port is occupied, choose another port and update all matching values. The manual server does not
silently choose a replacement port because the controller and UI would not automatically know about
that replacement.

## Why These Defaults?

- `HOST=0.0.0.0` makes the hub reachable from the controller on the local network.
- `127.0.0.1` is still used for local health checks because the setup assistant runs on the same
  computer as the hub.
- `localhost` is not a valid controller target. From the controller's point of view, `localhost`
  means the controller itself, not your laptop.
- UI reconnect is automatic because it reconnects to the same known hub URL.
- Hub port selection is explicit because a changed hub port must also be written into the controller
  configuration.

## Diagnostics

USB serial emits setup/status frames and a throttled telemetry mirror at 115200 baud.
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
- **The hub port is busy:** run the guided setup or choose an explicit free `PORT` and pass the same
  port to `PUBLIC_M5_HUB_PORT` and the controller `serverUrl`.
- **Telemetry is flaky but serial works:** check WiFi signal first, then reduce competing serial
  monitors. The firmware intentionally sends fewer USB mirror frames than WebSocket frames so serial
  logging does not dominate runtime timing.
- **The 3D scene is blank:** check whether the telemetry numbers update. If they do, the data path is
  alive and the likely issue is WebGL/GPU support. The UI should show a fallback message instead of
  breaking the rest of the page.
- **Multiple serial devices are listed:** use the CH9102/WCH device, not unrelated USB CDC devices.
- **The setup assistant asks for a computer IP:** choose the LAN IP that the controller can reach,
  not `127.0.0.1`, unless you are only doing a local hub smoke test.
