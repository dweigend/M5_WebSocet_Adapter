# Work Packages

## Coordination Status

- [x] WP0: Repository coordination files are present.
- [ ] WP1: Project skeleton and Git repository are initialized.
- [ ] WP2: Bun WebSocket hub is implemented.
- [ ] WP3: Firmware skeleton and telemetry loop are implemented.
- [ ] WP4: Web Serial setup UI is implemented.
- [ ] WP5: Three.js live test UI is implemented.
- [ ] WP6: End-to-end integration pass is complete.
- [ ] WP7: Verification and final documentation are complete.

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

- [ ] `git status --short --branch` works.
- [ ] `bun install` succeeds.
- [ ] `bun run lint` succeeds.
- [ ] `bun run check` succeeds.
- [ ] `bun run build` succeeds.
- [ ] `bun run test` succeeds.
- [ ] A checkpoint commit exists.

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

- [ ] Invalid JSON is rejected without crashing the server.
- [ ] Unknown message types are rejected.
- [ ] `register`, `heartbeat`, `imu`, and `orientation` update device state.
- [ ] Sequence gaps increase packet-loss estimate.
- [ ] Missing telemetry for more than 3 seconds marks device safe mode.
- [ ] UI clients receive snapshots and live updates.
- [ ] Unit tests cover validation, sequence handling, and stale-device logic.

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

- [ ] `pio run` succeeds where PlatformIO is available.
- [ ] Main loop has no long blocking `delay()` in normal operation.
- [ ] `M5.update()` runs every loop.
- [ ] `webSocket.loop()` runs whenever WebSocket is active.
- [ ] Heartbeat interval is 2 seconds.
- [ ] IMU target interval is 20 ms.
- [ ] Configuration survives reboot via `Preferences`.

Metrics:

- WiFi and WebSocket connect within 10 seconds after saved config in normal local conditions.
- Reconnect after server restart happens within 10 seconds.
- Firmware reports lost server/WiFi within 3 seconds.

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

- [ ] UI does not call Web Serial during SSR.
- [ ] Unsupported browsers show a clear disabled state.
- [ ] Form sends exactly one newline-delimited JSON configure message.
- [ ] `configureResult` is displayed.
- [ ] Serial reader/writer are closed on disconnect/unmount.

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

- [ ] Three.js renderer is created only on mount.
- [ ] Renderer is disposed on unmount.
- [ ] Canvas resizes without layout jumps.
- [ ] Orientation updates are applied without recreating the scene.
- [ ] UI handles disconnected server state.
- [ ] Control commands include a target `deviceId`.

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

- [ ] README includes local startup commands.
- [ ] README includes firmware build/upload/monitor commands.
- [ ] JSON protocol is consistent across firmware, server, tests, and UI.
- [ ] Simulator or test harness can send sample telemetry to the server.
- [ ] All available checks pass or failures are clearly documented.

## WP7: Final Verification

Owner: supervisor session.

Goals:

- Confirm that all sessions completed their work packages.
- Confirm all available checks.
- Summarize remaining hardware-only verification steps.

Acceptance criteria:

- [ ] `bun run lint` result recorded.
- [ ] `bun run check` result recorded.
- [ ] `bun run build` result recorded.
- [ ] `bun run test` result recorded.
- [ ] `pio run` result recorded or PlatformIO absence documented.
- [ ] `git status --short --branch` is clean or intentional changes are listed.

## Parallelization Rules

- Session A owns root setup, server, protocol, state, and tests.
- Session B owns `firmware/`.
- Session C owns Svelte UI, Web Serial, Three.js, and CSS.
- Integration session resolves contract mismatches after A, B, and C.
- Supervisor session tracks progress against this file and should not implement feature work unless asked.
