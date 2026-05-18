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

## Coordination Rules

- Keep server/protocol, firmware, and UI work in separate sessions when possible.
- Do not edit another session's ownership area unless the integration session requires it.
- Keep code, file names, commit messages, pull requests, and code comments in English.
- Chat with the user in German.
- Run the checks listed in [TODO.md](./TODO.md) before considering a package complete.
