# Work Packages

## Coordination Status

- [x] WP0: Repository coordination files are present.
- [x] WP1: Project skeleton and Git repository are initialized.
- [x] WP2: Bun WebSocket hub is implemented.
- [x] WP3: Firmware skeleton and telemetry loop are implemented.
- [x] WP4: Web Serial setup UI is implemented.
- [x] WP5: Three.js live test UI is implemented.
- [x] WP6: End-to-end integration pass is complete.
- [x] WP7: Software verification and final documentation are complete.
- [x] WP8: USB test mode treats Web Serial as a first-class telemetry transport.

## WP0: Coordination Files

Owner: supervisor session.

Goal:

- Save the plan, task list, and session prompts before implementation starts.

Acceptance criteria:

- [x] `README.md` points to all planning files.
- [x] `PLAN.md` contains architecture, protocol, boundaries, and metrics.
- [x] `TODO.md` contains work packages and metrics.
- [x] `SESSION_PROMPTS.md` contains ready-to-use prompts for parallel sessions.

## WP1: Repository And Project Skeleton

Owner: Session A.

Write scope:

- Root project config.
- SvelteKit skeleton.
- Shared scripts.
- Documentation updates that describe setup commands.
- Do not implement firmware beyond placeholder folders unless needed for structure.

Goals:

- Initialize Git.
- Create a Bun/SvelteKit/Svelte 5/TypeScript project.
- Add Biome, Vitest, Three.js, Lucide, and required Svelte tooling.
- Keep styling centralized in `src/app.css`.
- Add initial scripts for `dev`, `server`, `lint`, `check`, `build`, and `test`.

Acceptance criteria:

- [x] `git status --short --branch` works.
- [x] `bun install` succeeds.
- [x] `bun run lint` succeeds.
- [x] `bun run check` succeeds.
- [x] `bun run build` succeeds.
- [x] `bun run test` succeeds.
- [x] A checkpoint commit exists.

## WP2: Bun WebSocket Hub

Owner: Session A.

Write scope:

- Server runtime files.
- Shared protocol and state validation modules.
- Unit tests for protocol and device state.

Goals:

- Implement `/ws/device`.
- Implement `/ws/ui`.
- Validate all incoming JSON.
- Track connected devices.
- Estimate packet loss from sequence gaps.
- Mark safe mode when messages are stale or invalid.
- Broadcast valid telemetry and status to UI clients.
- Forward UI commands to target devices.

Acceptance criteria:

- [x] Invalid JSON is rejected without crashing the server.
- [x] Unknown message types are rejected.
- [x] `register`, `heartbeat`, `imu`, and `orientation` update device state.
- [x] Sequence gaps increase packet-loss estimate.
- [x] Missing telemetry for more than 3 seconds marks device safe mode.
- [x] UI clients receive snapshots and live updates.
- [x] Unit tests cover validation, sequence handling, and stale-device logic.

Metrics:

- Server receives at least 50 telemetry messages per second from one simulated device.
- UI broadcast happens within 100 ms after server receipt in local development.

## WP3: Firmware

Owner: Session B.

Write scope:

- `firmware/`.
- Firmware-specific documentation.
- Do not edit Svelte UI files.

Goals:

- Create PlatformIO project for M5StickC Plus2.
- Use `M5Unified`, `WiFi.h`, `arduinoWebSockets`, `ArduinoJson`, and `Preferences`.
- Implement Web Serial setup with newline-delimited JSON.
- Store and load SSID, password, server URL, and device ID.
- Keep WiFi reconnect and WebSocket reconnect separate.
- Send `register`, `heartbeat`, `imu`, and `orientation`.
- Handle `calibrate`, `pause`, `resume`, `identify`, and `reboot`.

Acceptance criteria:

- [x] `bun run firmware:build` succeeds with uv-managed PlatformIO.
- [x] Main loop has no long blocking `delay()` in normal operation.
- [x] `M5.update()` runs every loop.
- [x] `webSocket.loop()` runs whenever WebSocket is active.
- [x] Heartbeat interval is 2 seconds.
- [x] IMU target interval is 20 ms.
- [x] Configuration survives reboot via `Preferences`.

Metrics:

- WiFi and WebSocket connect within 10 seconds after saved config in normal local conditions. Hardware verification remains open.
- Reconnect after server restart happens within 10 seconds. Hardware verification remains open.
- Firmware reports lost server/WiFi within 3 seconds through heartbeat/WebSocket timeout settings. Hardware verification remains open.

Integration notes:

- `firmware/platformio.ini` targets ESP32 Arduino with `M5Unified`, `arduinoWebSockets`, and `ArduinoJson`.
- `firmware/src/main.cpp` uses `Preferences` for `ssid`, `password`, `serverUrl`, and `deviceId`.
- Global `pio` is not required. Firmware tooling is installed with `uv` and verified through `bun run firmware:build`.

## WP4: Web Serial Setup UI

Owner: Session C.

Write scope:

- Svelte routes/components for setup.
- Browser-side serial utilities.
- Central styles in `src/app.css`.
- Do not edit firmware files.

Goals:

- Connect and disconnect a serial port.
- Send `configure` JSON with SSID, password, server URL, and device ID.
- Read newline-delimited firmware responses.
- Show success and failure states.
- Show Web Serial unsupported state.

Acceptance criteria:

- [x] UI does not call Web Serial during SSR.
- [x] Unsupported browsers show a clear disabled state.
- [x] Form sends exactly one newline-delimited JSON configure message.
- [x] `configureResult` is displayed.
- [x] Serial reader/writer are closed on disconnect/unmount.

Metrics:

- A user can complete setup in under 60 seconds once the device is plugged in.

## WP5: Three.js Test UI

Owner: Session C.

Write scope:

- Svelte routes/components for live telemetry.
- Three.js visualization component.
- UI WebSocket client.
- Central styles in `src/app.css`.

Goals:

- Connect to `/ws/ui`.
- Render device status.
- Render telemetry and message age.
- Visualize orientation on a Stick-like 3D object.
- Send `calibrate`, `pause`, `resume`, `identify`, and `reboot` commands.
- Show safe mode when data is stale or invalid.

Acceptance criteria:

- [x] Three.js renderer is created only on mount.
- [x] Renderer is disposed on unmount.
- [x] Canvas resizes without layout jumps.
- [x] Orientation updates are applied without recreating the scene.
- [x] UI handles disconnected server state.
- [x] Control commands include a target `deviceId`.

Metrics:

- UI reflects fresh orientation updates typically under 100 ms after server receipt.
- Safe mode appears within 3 seconds after telemetry stops.

## WP6: Integration

Owner: Integration session.

Write scope:

- Any file needed to align the already implemented slices.
- Keep changes small and explain cross-area edits.

Goals:

- Align firmware, server, and UI message shapes.
- Run simulated WebSocket telemetry through server to UI.
- Verify Web Serial message format against firmware parser.
- Update README with exact commands.
- Run refactor pass for naming, boundaries, and file size.

Acceptance criteria:

- [x] README includes local startup commands.
- [x] README includes firmware build/upload/monitor commands.
- [x] JSON protocol is consistent across firmware, server, tests, and UI.
- [x] Simulator or test harness can send sample telemetry to the server.
- [x] All available checks pass or failures are clearly documented.

Integration notes:

- Web Serial sends exactly one newline-delimited `configure` JSON object with `ssid`, `password`, `serverUrl`, and `deviceId`; firmware parses the same keys and replies with `configureResult`.
- Device frames `register`, `heartbeat`, `imu`, and `orientation` match `src/lib/protocol.ts` and firmware emitters.
- UI commands include `deviceId`; the server validates the target and forwards command frames without `deviceId`, matching the firmware parser.
- `bun run test` runs Vitest and then `bun run verify:integration`, so the Bun-only hub WebSocket happy path is part of the regular test command instead of a skipped Vitest suite.
- `bun run verify:integration` remains available as a focused integration check for sample orientation telemetry from a simulated device through the hub to a UI socket and `identify` command forwarding back to the device socket.

## WP7: Final Verification

Owner: supervisor session.

Goals:

- Confirm that all sessions completed their work packages.
- Confirm all available checks.
- Summarize remaining hardware-only verification steps.

Acceptance criteria:

- [x] `bun run lint` result recorded.
- [x] `bun run check` result recorded.
- [x] `bun run build` result recorded.
- [x] `bun run test` result recorded.
- [x] `bun run firmware:build` result recorded.
- [x] `git status --short --branch` is clean or intentional changes are listed.

Verification results from 2026-05-20 integration session:

- `bun run lint`: passed.
- `bun run check`: passed.
- `bun run build`: passed.
- `bun run test`: passed; includes Vitest plus the Bun WebSocket integration harness.
- `bun run verify:integration`: passed.
- `bun run firmware:build`: passed with uv-managed PlatformIO.
- `git status --short --branch`: expected clean after the final integration commit.

## WP8: USB Test Mode

Owner: integration session.

Write scope:

- Browser-side USB session orchestration.
- Svelte test-mode panels.
- Source-aware UI command routing.
- Focused tests and short documentation updates.

Goals:

- Use USB as a live telemetry transport without SSID, password, or saved WebSocket config.
- Keep raw serial lines, parsed frame counters, invalid-line diagnostics, and telemetry rate visible.
- Feed valid USB frames into the same device state model and Three.js visualization as hub frames.
- Route commands to USB for USB-sourced devices and use the hub only when USB is unavailable.
- Keep firmware flashing out of the live telemetry workflow.

Acceptance criteria:

- [x] USB orchestration is extracted from `src/routes/+page.svelte`.
- [x] Raw serial log keeps the last 500 lines.
- [x] `register`, `heartbeat`, `imu`, `orientation`, `configureResult`, and unsupported lines have counters.
- [x] Source is shown as `usb`, `hub`, or `both`.
- [x] Commands prefer USB for USB-sourced devices and fall back to hub when USB is unavailable.
- [x] Unit tests cover USB session parsing, ringbuffer behavior, frame counters, and command routing.
- [ ] Final hardware verification on a real M5StickC Plus2 remains open.

## Parallelization Rules

- Session A owns root setup, server, protocol, state, and tests.
- Session B owns `firmware/`.
- Session C owns Svelte UI, Web Serial, Three.js, and CSS.
- Integration session resolves contract mismatches after A, B, and C.
- Supervisor session tracks progress against this file and should not implement feature work unless asked.
