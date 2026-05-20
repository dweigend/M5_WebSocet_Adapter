# Session Prompts

These prompts are maintainer notes for splitting implementation work into focused sessions. They are
not required reading for students who only want to run the project. Start with `README.md` and
`docs/controller-setup.md` for normal use.

## Session A: Repository And Server

```text
Start a build session in /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Read README.md, PLAN.md, and TODO.md first. Work only on WP1 and WP2 from TODO.md.

Goals:
- Initialize Git if needed.
- Create the Bun/SvelteKit/Svelte 5/TypeScript project skeleton.
- Configure Biome, Vitest, Three.js, Lucide, and Svelte checks.
- Build the Bun-native WebSocket hub.
- Implement /ws/device and /ws/ui.
- Type and validate the JSON protocol.
- Implement device state, heartbeat timeout status, sequence checks, packet-loss estimates, and UI broadcasts.
- Write unit tests for protocol validation and device state.

Do not:
- Work in firmware/ except for placeholder structure if needed.
- Build UI features beyond a minimal SvelteKit skeleton.
- Add a backend framework.

Done means:
- bun run lint passes.
- bun run check passes.
- bun run build passes.
- bun run test passes.
- A simulated device stream can process at least 50 messages per second locally.
- Safe mode is set after more than 3 seconds without fresh telemetry.

Check git status before editing. Finish with a focused English commit message.
```

## Session B: Firmware

```text
Start a build session in /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Read README.md, PLAN.md, and TODO.md first. Work only on WP3 from TODO.md.

Goals:
- Create firmware/ as a PlatformIO project for M5StickC Plus2.
- Use M5Unified, WiFi.h, arduinoWebSockets, ArduinoJson, and Preferences.
- Use uv-managed tools only: .venv/bin/pio and .venv/bin/python.
- Implement Web Serial setup with newline-delimited JSON.
- Store and load SSID, password, server URL, and device ID in Preferences.
- Keep WiFi reconnect and WebSocket reconnect separate and non-blocking.
- Send register, heartbeat, imu, and orientation frames.
- Receive and execute calibrate, pause, resume, reboot, and identify commands.
- Show display status for headless operation.

Do not:
- Work on Svelte UI or server files.
- Add long delay() blocks to the normal loop.
- Build direct VR control.

Done means:
- bun run tools:setup passes.
- bun run firmware:build passes when firmware tooling is available.
- M5.update() runs in every loop iteration.
- webSocket.loop() runs regularly when WebSocket is active.
- Heartbeat is sent every 2 seconds.
- IMU target interval is 20 ms.
- WiFi/WebSocket connects within 10 seconds after saved config under normal local conditions.
- Connection loss is visible within 3 seconds.

Check git status before editing. Finish with a focused English commit message.
```

## Session C: Setup And Test UI

```text
Start a build session in /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Read README.md, PLAN.md, and TODO.md first. Work only on WP4 and WP5 from TODO.md.

Goals:
- Build the SvelteKit/Svelte 5 setup and diagnostics UI.
- Implement Web Serial connect/disconnect.
- Build the form for SSID, password, server URL, and device ID.
- Send configure JSON as newline-delimited JSON to the Stick.
- Show configureResult.
- Build the /ws/ui WebSocket client.
- Show live device status: connected, calibrated, RSSI, heap, battery, packet loss, and last message.
- Build the Three.js orientation visualization with a Stick model.
- Add controls for calibrate, pause, resume, identify, and reboot.
- Show safe mode for stale or invalid data.

Design and code rules:
- Keep styles in src/app.css.
- Do not use inline styles.
- Do not use Tailwind utility classes in markup.
- Use Lucide icons where useful.
- Initialize Three.js only in the browser/onMount.
- Dispose renderers and event listeners on unmount.

Do not:
- Work in firmware/.
- Change the server protocol shape without updating PLAN.md/TODO.md and leaving a short integration note.

Done means:
- bun run lint passes.
- bun run check passes.
- bun run build passes.
- bun run test passes.
- Setup can be completed with a connected Stick in under 60 seconds.
- The UI shows safe mode within 3 seconds after telemetry stops.

Check git status before editing. Finish with a focused English commit message.
```

## Integration Session

```text
Start an integration session in /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Read README.md, PLAN.md, and TODO.md first. Verify Session A, B, and C against WP6 and WP7 in TODO.md.

Goals:
- Align server, firmware, and UI protocol shapes end to end.
- Check Web Serial configure JSON against the firmware parser.
- Test simulated WebSocket telemetry through the server to the UI socket.
- Test command frames from UI through the server to the device connection.
- Update README with exact start, build, upload, and monitor commands.
- Run a refactor pass for clear file boundaries, naming, and simple structure.
- Run all available checks.

Done means:
- bun run lint passes.
- bun run check passes.
- bun run build passes.
- bun run test passes.
- bun run firmware:build passes when firmware tooling is available.
- Safe mode appears after more than 3 seconds without telemetry.
- The Stick reconnects within 10 seconds after a server restart when hardware testing is possible.
- git status is clean or intentionally open changes are documented.

Finish with a focused English commit message.
```

## Supervisor Session

```text
Supervise /Volumes/SSD_Data/GitBase/M5_WebSocet_Adapter.

Read README.md, PLAN.md, TODO.md, and SESSION_PROMPTS.md. Do not implement feature work unless the user explicitly asks for it.

Tasks:
- Check progress against TODO.md.
- Read git status and recent commits.
- Identify blocking mismatches between Session A, B, C, and integration work.
- Update TODO.md only for status/coordination, not feature implementation.
- Give short German status reports with open risks, the next useful step, and missing checks.

Done means:
- Each session stays inside its write scope.
- Acceptance criteria from TODO.md are visibly checked.
- Deviations from PLAN.md are found early.
- No supervisor feature implementation happens without explicit approval.
```
