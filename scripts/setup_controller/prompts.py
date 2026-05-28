"""Prompt helpers for the step-by-step setup assistant.

The TUI is intentionally line-oriented so it works in ordinary terminals, over
SSH, and inside editor consoles. These helpers keep input validation small and
consistent across the setup flow.
"""

from __future__ import annotations


def prompt_default(label: str, default: str) -> str:
    value = read_input(f"{label} [{default}]: ", default)
    return value or default


def prompt_required(label: str) -> str:
    while True:
        value = read_input(f"{label}: ", None)
        if value:
            return value
        print(f"{label} is required.")


def prompt_optional(label: str) -> str | None:
    value = read_input(f"{label}: ", "")
    return value or None


def prompt_password(label: str = "WiFi password") -> str:
    return read_input(f"{label}: ", "")


def prompt_int(label: str, default: int) -> int:
    while True:
        value = read_input(f"{label} [{default}]: ", str(default))
        if not value:
            return default
        parsed = parse_port(value)
        if parsed is not None:
            return parsed
        print("Enter a TCP port between 1 and 65535.")


def confirm(label: str, *, default: bool) -> bool:
    suffix = "Y/n" if default else "y/N"
    default_value = "y" if default else "n"
    value = read_input(f"{label} [{suffix}]: ", default_value).lower()
    if not value:
        return default
    return value in {"y", "yes", "j", "ja"}


def read_input(prompt: str, eof_default: str | None) -> str:
    try:
        return input(prompt).strip()
    except EOFError as error:
        if eof_default is not None:
            print()
            return eof_default
        raise SystemExit("Setup needs interactive input.") from error


def parse_port(value: str) -> int | None:
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if 1 <= parsed <= 65535 else None
