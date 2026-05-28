"""Persist local setup metadata for the controller assistant.

The config stores a stable computer identifier and remembered controller IDs so
multiple users on the same WLAN can avoid collisions. It deliberately excludes
WiFi passwords and other secrets.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import socket
from collections.abc import Mapping
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import cast

DEFAULT_HUB_PORT = 8787
CONFIG_PATH = Path.home() / ".config" / "m5-websocket-adapter" / "setup.json"


@dataclass(frozen=True)
class KnownController:
    device_id: str
    last_configured_ssid: str | None = None


@dataclass(frozen=True)
class SetupConfig:
    computer_id: str
    default_hub_port: int
    known_controllers: list[KnownController]


def load_config() -> SetupConfig:
    """Load saved IDs defensively because users may edit this JSON file by hand."""
    if not CONFIG_PATH.exists():
        return create_default_config()

    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read {CONFIG_PATH}: {error}")
        return create_default_config()

    config = as_mapping(raw)
    if config is None:
        return create_default_config()

    return SetupConfig(
        computer_id=sanitize_identifier(str(config.get("computerId") or generate_computer_id())),
        default_hub_port=parse_hub_port(config.get("defaultHubPort")),
        known_controllers=parse_known_controllers(config.get("knownControllers")),
    )


def save_config(config: SetupConfig) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(to_json(config), indent=2) + "\n", encoding="utf-8")
    with suppress(OSError):
        os.chmod(CONFIG_PATH, 0o600)


def create_default_config() -> SetupConfig:
    return SetupConfig(generate_computer_id(), DEFAULT_HUB_PORT, [])


def with_computer_id(config: SetupConfig, computer_id: str) -> SetupConfig:
    return SetupConfig(
        computer_id=sanitize_identifier(computer_id),
        default_hub_port=config.default_hub_port,
        known_controllers=config.known_controllers,
    )


def record_controller(
    config: SetupConfig, *, device_id: str, ssid: str, hub_port: int
) -> SetupConfig:
    controllers = [item for item in config.known_controllers if item.device_id != device_id]
    controllers.append(KnownController(device_id=device_id, last_configured_ssid=ssid))
    return SetupConfig(config.computer_id, hub_port, controllers)


def suggest_next_device_id(config: SetupConfig) -> str:
    suffix = config.computer_id.rsplit("-", maxsplit=1)[-1]
    used_numbers = used_controller_numbers(config, suffix)
    next_number = 1
    while next_number in used_numbers:
        next_number += 1
    return f"m5-{suffix}-{next_number:03d}"


def sanitize_identifier(value: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9-]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", sanitized).strip("-")[:64]


def generate_computer_id() -> str:
    hostname = sanitize_identifier(socket.gethostname().split(".")[0]) or "computer"
    return f"{hostname}-{secrets.token_hex(3)}"


def parse_known_controllers(value: object) -> list[KnownController]:
    if not isinstance(value, list):
        return []

    controllers: list[KnownController] = []
    for item in value:
        controller = as_mapping(item)
        if controller is None:
            continue
        device_id = str(controller.get("deviceId", "")).strip()
        if device_id:
            controllers.append(
                KnownController(device_id, optional_string(controller.get("lastConfiguredSsid")))
            )
    return controllers


def as_mapping(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, Mapping):
        return None
    return cast(Mapping[str, object], value)


def parse_hub_port(value: object) -> int:
    if not isinstance(value, str | int) or isinstance(value, bool):
        return DEFAULT_HUB_PORT

    try:
        parsed_port = int(value)
    except (TypeError, ValueError):
        return DEFAULT_HUB_PORT
    return parsed_port if 1 <= parsed_port <= 65535 else DEFAULT_HUB_PORT


def used_controller_numbers(config: SetupConfig, suffix: str) -> set[int]:
    pattern = re.compile(rf"^m5-{re.escape(suffix)}-(\d+)$")
    numbers: set[int] = set()
    for controller in config.known_controllers:
        match = pattern.match(controller.device_id)
        if match:
            numbers.add(int(match.group(1)))
    return numbers


def optional_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def to_json(config: SetupConfig) -> dict[str, object]:
    return {
        "computerId": config.computer_id,
        "defaultHubPort": config.default_hub_port,
        "knownControllers": [
            {
                "deviceId": item.device_id,
                "lastConfiguredSsid": item.last_configured_ssid,
            }
            for item in config.known_controllers
        ],
    }
