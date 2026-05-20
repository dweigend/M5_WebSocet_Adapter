# USB Test Mode and Device Management Plan

This is a historical design plan. The current USB setup and diagnostics flow is documented in
`README.md`, `docs/controller-setup.md`, and `TODO.md`.

## Summary

The adapter should support a USB-first workflow for a freshly connected M5StickC Plus2:

- The user connects the device over USB and clicks `Connect via USB`.
- The browser asks for one Web Serial permission.
- The UI auto-reuses an already granted M5 serial port via `navigator.serial.getPorts()` or opens the browser chooser with M5/WCH filters via `navigator.serial.requestPort()`.
- The UI receives the same `register`, `heartbeat`, `imu`, and `orientation` frames over USB that the firmware sends over WebSocket.
- The live telemetry panels and Three.js visualization work without WiFi, SSID, password, or WebSocket configuration.
- Setup and control commands are sent over USB as newline-delimited JSON.
- Firmware flashing is treated as a separate device-management capability, not mixed into the live telemetry runtime.

This plan is intentionally implementation-ready, but no implementation should happen in the planning session.

## Current Repository State

- USB telemetry is already possible in principle because firmware serializes every telemetry JSON frame to `Serial` before optionally sending it over WebSocket.
- `src/lib/serial-setup.ts` already uses Web Serial, `getPorts()`, M5/WCH-like USB filters, line splitting, and command/configure writes.
- `src/routes/+page.svelte` already parses serial lines with `parseDeviceMessage()` and feeds them into `DeviceRegistry`.
- The current UI still treats USB mostly as setup plumbing. It lacks a real test mode, rich raw logs, source-aware command routing, and a complete visual overview of incoming frame types.
- `sendCommand()` currently prefers WebSocket whenever the hub is online, even when the selected device is only present through USB.
- Firmware flashing is documented/available through PlatformIO, but not modeled in UI or package scripts.

## External Research Notes

- Web Serial supports the desired user-permission model: a site can call `navigator.serial.requestPort()` from a click handler, then later use `navigator.serial.getPorts()` for ports that the origin already has permission to access.
- Web Serial supports USB filters with `usbVendorId` and optional `usbProductId`, which fits the current M5/WCH port discovery approach.
- Localhost is acceptable for local development; non-local deployment needs HTTPS because Web Serial requires a secure context.
- M5StickC Plus2 uses an ESP32-PICO-V3-02, includes the built-in 3-axis accelerometer and gyroscope, and uses a CH9102 USB-UART bridge. M5Stack documents a `monitor_speed` of `115200` for PlatformIO.
- ESP Web Tools and Espressif `esptool-js` both use Web Serial for browser-based ESP flashing. They require prepared firmware artifacts and should not share an open telemetry port at the same time.

## Product Goals

1. USB Test Mode works before WiFi setup.
2. USB and WebSocket use the same protocol and the same state model.
3. The operator can inspect raw serial traffic and parsed telemetry side by side.
4. Commands route through the selected device's active transport.
5. Setup over USB remains simple and reliable.
6. Firmware flashing is designed as a separate, guarded workflow with a clear V1/V2 boundary.

## Target Metrics

- USB connect: after permission is granted, telemetry appears in the UI within 5 seconds when compatible firmware is running.
- USB-only telemetry: at least 30 Hz visible IMU/orientation updates, target 50 Hz.
- Raw log: keep at least the last 500 serial lines in memory without UI jank.
- Parser visibility: show valid frame count, invalid line count, last parse error, and per-type counts for `register`, `heartbeat`, `imu`, `orientation`, `configureResult`, and unsupported lines.
- Command routing: for a USB-only selected device, `calibrate`, `pause`, `resume`, `identify`, and `reboot` go over USB even if the hub is online.
- Setup: `configure` writes and `configureResult` responses remain newline-delimited JSON and complete in under 2 seconds after the line is written.
- Safety: firmware flashing is unavailable while the telemetry serial session is open.
- Verification: `bun run lint`, `bun run check`, `bun run build`, `bun run test`, and firmware checks relevant to the touched files pass or have documented blockers.

## Proposed Architecture

### Transport Model

Treat USB as a first-class transport, not as a setup special case.

Add a browser-only USB session module, for example `src/lib/usb-test-session.svelte.ts` or `src/lib/usb-test-session.ts`, responsible for:

- Owning `SerialSetupConnection`.
- Parsing raw serial lines with `parseDeviceMessage()`.
- Feeding valid device messages into `DeviceRegistry`.
- Tracking raw lines, parsed frames, invalid lines, counters, rates, and errors.
- Sending USB commands and setup messages.
- Exposing a small typed state object to Svelte components.

Keep `src/lib/protocol.ts` as the source of truth for device frames and UI commands.

### Device Source State

Represent how each device was observed:

```ts
type DeviceTransportSource = "usb" | "hub" | "both";
```

The UI should show the source next to each device and use it for command routing.

Command routing rule:

1. If selected device has USB source and the USB connection is open, send over USB.
2. Else if hub is connected, send over WebSocket.
3. Else disable the command and show an actionable status.

### UI Components

Keep styles in `src/app.css` and avoid inline styles or Tailwind classes.

Recommended components:

- `UsbTestModePanel.svelte`
  - USB connect/disconnect
  - device/source status
  - telemetry rate
  - last frame time
  - valid/invalid counters
  - current mode: streaming/paused/safe
- `RawSerialConsole.svelte`
  - latest raw lines
  - filter by frame type or invalid lines
  - pause/resume log
  - clear log
  - copy/export log text
- `TelemetryOverviewPanel.svelte`
  - visual summary of all received fields
  - heartbeat values
  - accelerometer vector
  - gyro vector
  - pitch/roll/yaw
  - sequence and packet-loss metrics
- `DeviceManagementPanel.svelte`
  - setup/configure controls
  - `getConfig`, `clearConfig`, `status`, and `identify` if firmware support is added
  - firmware workflow status and documentation link

Existing `TelemetryPanel` and `OrientationScene` should remain transport-agnostic and continue to render `DeviceSnapshot`.

### Firmware Protocol Additions

Keep the existing newline-delimited JSON protocol.

Recommended additional USB-side messages:

```json
{"type":"statusRequest"}
{"type":"getConfig"}
{"type":"clearConfig"}
{"type":"startTelemetry"}
{"type":"stopTelemetry"}
```

Recommended responses:

```json
{"type":"statusResult","ok":true,"firmwareVersion":"0.1.0","deviceId":"m5stick-plus2-usb","hasConfig":false,"streaming":true}
{"type":"configResult","ok":true,"ssid":"...","serverUrl":"ws://localhost:8787/ws/device","deviceId":"..."}
{"type":"configureResult","ok":true,"message":"Configuration saved"}
```

Do not put firmware flashing logic into the runtime firmware protocol. Flashing belongs to the ESP bootloader/host side.

### Firmware Flashing Strategy

V1:

- Add package scripts/documentation for PlatformIO:
  - `firmware:build`
  - `firmware:upload`
  - `firmware:monitor`
- UI can show instructions and current local server/device WebSocket URL, but should not try to flash firmware in V1.

V2 optional:

- Add a separate firmware update panel.
- Use either ESP Web Tools with a generated manifest or `esptool-js` directly.
- Require the USB telemetry session to be disconnected before flashing.
- Use prebuilt `.bin` artifacts from PlatformIO.
- Document flash addresses, merged binary generation, browser support, and recovery steps.
- Keep the feature explicitly marked experimental until verified on real M5StickC Plus2 hardware.

## Work Packages

### WP1: USB Session Refactor

- Extract USB orchestration from `src/routes/+page.svelte`.
- Keep `SerialSetupConnection` as low-level Web Serial wrapper.
- Add USB session state with raw logs, parsed frame counters, invalid counters, rate calculation, and selected port info.
- Add tests for serial line parsing and log ring-buffer behavior.

### WP2: Source-Aware Device State

- Add transport source metadata in the UI layer without breaking server-side `DeviceRegistry`.
- Merge hub and USB snapshots deterministically.
- Prefer USB commands for USB-selected devices.
- Add unit tests for command-routing decisions.

### WP3: Test Mode UI

- Build a USB test mode panel that works without SSID/password.
- Show live telemetry health, frame counts, packet loss, and source.
- Add raw serial console with pause, clear, and copy/export.
- Show a structured telemetry overview for heartbeat, IMU, orientation, and setup responses.

### WP4: Setup Over USB

- Keep `configure` flow.
- Add optional status/config request commands if firmware support is added.
- Improve setup acknowledgements and error display.
- Show the local WebSocket device URL clearly so it can be written into the Stick config.

### WP5: Firmware Support

- Add firmware-side handlers for optional status/config/test-mode commands.
- Ensure `M5.update()`, `readSerialSetup()`, `webSocket.loop()`, and telemetry stay non-blocking.
- Keep serial output parseable as newline-delimited JSON.
- Add visible display feedback for USB connected/test mode where feasible.

### WP6: Firmware Management V1

- Add PlatformIO scripts to `package.json` if available in the local environment.
- Document build/upload/monitor steps in `README.md`.
- Add a disabled or documentation-only firmware management UI section.
- Defer browser flashing until binary artifacts and real-device recovery have been verified.

### WP7: Verification

- Run repository checks.
- Run firmware build if PlatformIO is installed.
- Manually verify in Chrome or Edge:
  - USB permission prompt opens from button click.
  - granted port reconnects through `getPorts()`.
  - telemetry appears without WiFi config.
  - raw log receives valid JSON lines.
  - Three.js visualization updates from USB orientation frames.
  - commands work over USB.
  - configure writes and receives `configureResult`.

## Risks and Constraints

- If the Stick still has factory firmware, the browser can connect to the serial port but cannot receive this project's JSON telemetry until the project firmware is flashed once.
- Web Serial is Chromium-oriented in practice and is not available in Safari/iOS.
- M5StickC Plus2 CH9102 drivers may be required depending on OS setup.
- Browser flashing can leave the device in a confusing state if interrupted; keep it separate from test mode and document recovery.
- A serial port cannot be reliably shared between telemetry and flashing at the same time.

## Next Agent Success Criteria

- A USB-connected M5StickC Plus2 with this firmware can be used as a live telemetry source without WiFi setup.
- The operator sees raw serial traffic, parsed telemetry, field-level values, and the Three.js visualization in one coherent test workflow.
- Commands and setup work over USB with clear status feedback.
- The implementation remains modular: protocol, serial transport, USB session state, UI panels, and firmware handlers are separated.
- Browser flashing is not implemented unless explicitly scoped as a separate guarded V2 task.
