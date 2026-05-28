"""Run local repository commands for setup, verification, and dev servers.

The helpers keep subprocess handling predictable: foreground commands fail
fast, background commands are announced and left running for the user, and all
paths are resolved relative to the repository root.
"""

from __future__ import annotations

import os
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class CommandResult:
    label: str
    ok: bool


def ensure_bun_dependencies() -> CommandResult:
    return run_foreground("Install Bun dependencies", ["bun", "install"])


def ensure_controller_tools() -> CommandResult:
    return run_foreground("Install controller tools with uv", ["bun", "run", "tools:setup"])


def run_verification_checks() -> list[CommandResult]:
    return [
        run_foreground("Python syntax", uv_python(["-m", "py_compile", *python_files()])),
        run_foreground("Python lint", ["bun", "run", "python:lint"]),
        run_foreground("Python typecheck", ["bun", "run", "python:typecheck"]),
        run_foreground("Lint", ["bun", "run", "lint"]),
        run_foreground("Svelte check", ["bun", "run", "check"]),
        run_foreground("Frontend build", ["bun", "run", "build"]),
        run_foreground("Tests", ["bun", "run", "test"]),
        run_foreground("Firmware build", ["bun", "run", "firmware:build"]),
    ]


def upload_firmware() -> CommandResult:
    return run_foreground("Upload firmware", ["bun", "run", "firmware:upload"])


def start_bun_server(hub_port: int) -> subprocess.Popen[str] | None:
    return start_background(
        "Bun WebSocket hub",
        ["bun", "run", "server"],
        env={"HOST": "0.0.0.0", "PORT": str(hub_port)},
    )


def start_website(
    *, ui_port: int, hub_port: int, device_host: str
) -> subprocess.Popen[str] | None:
    return start_background(
        "SvelteKit dev server",
        [
            "bun",
            "run",
            "dev",
            "--",
            "--host",
            "0.0.0.0",
            "--port",
            str(ui_port),
        ],
        env={
            "PUBLIC_M5_DEVICE_HOST": device_host,
            "PUBLIC_M5_HUB_PORT": str(hub_port),
        },
    )


def uv_python(args: list[str]) -> list[str]:
    return ["uv", "run", "python", *args]


def python_files() -> list[str]:
    module_files = sorted(
        str(path.relative_to(REPO_ROOT))
        for path in (REPO_ROOT / "scripts/setup_controller").glob("*.py")
    )
    return ["scripts/setup-controller-tui.py", *module_files]


def run_foreground(label: str, command: list[str]) -> CommandResult:
    print(f"\n== {label} ==")
    try:
        completed = subprocess.run(command, cwd=REPO_ROOT, check=False)
    except OSError as error:
        print(f"{label} could not start: {error}")
        return CommandResult(label, False)
    return CommandResult(label, completed.returncode == 0)


def start_background(
    label: str, command: list[str], env: Mapping[str, str] | None = None
) -> subprocess.Popen[str] | None:
    print(f"\nStarting {label}: {' '.join(command)}")
    try:
        process = subprocess.Popen(
            command, cwd=REPO_ROOT, env=merged_env(env), text=True
        )
    except OSError as error:
        print(f"{label} could not start: {error}")
        return None
    print(f"{label} started with PID {process.pid}.")
    print("Press Ctrl+C here to stop the setup assistant only.")
    return process


def merged_env(extra_env: Mapping[str, str] | None) -> dict[str, str] | None:
    if extra_env is None:
        return None

    return {**os.environ, **extra_env}
