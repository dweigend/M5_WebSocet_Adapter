#!/usr/bin/env python3
"""Run the guided M5StickC Plus2 controller setup.

This file is intentionally only a thin entrypoint. The actual provisioning,
tooling, network, and prompt logic lives in `scripts/setup_controller/` so the
setup flow stays easy to read and change without growing a large script.
"""

from __future__ import annotations

from setup_controller.flow import main

if __name__ == "__main__":
    raise SystemExit(main())
