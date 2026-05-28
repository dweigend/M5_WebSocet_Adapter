"""Network helpers for local hub discovery and WebSocket verification.

The assistant only checks explicit local endpoints: HTTP `/health` on localhost
and the existing `/ws/ui` stream. It does not broadcast or discover controllers
globally, keeping multi-user WLAN setups deterministic.
"""

from __future__ import annotations

import importlib
import json
import socket
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from types import TracebackType
from typing import Protocol, cast

from .prompts import prompt_optional

HUB_HEALTH_TIMEOUT_SECONDS = 2.0
HUB_DEVICE_WAIT_SECONDS = 10.0


class HubWebSocket(Protocol):
    def recv(self, timeout: float | None = None) -> str | bytes:
        """Return the next WebSocket message or raise on timeout/close."""


class HubWebSocketContext(Protocol):
    def __enter__(self) -> HubWebSocket:
        """Open the WebSocket connection."""

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """Close the WebSocket connection."""


def choose_host_ip() -> str:
    candidates = detect_host_ips()

    while True:
        print_host_ip_candidates(candidates)
        selected = prompt_optional("IP number or manual IP [1]")
        resolved = resolve_ip_selection(selected, candidates)
        if resolved:
            return resolved
        print("Invalid IP number.")


def detect_host_ips() -> list[str]:
    detected_ips = unique_items([detect_primary_ip(), *resolve_hostname_ips()])
    lan_ips = [ip for ip in detected_ips if is_lan_ip(ip)]
    return [*lan_ips, "127.0.0.1"]


def check_hub_health(hub_port: int) -> bool:
    url = f"http://127.0.0.1:{hub_port}/health"
    print(f"\nChecking local hub health: {url}")

    if request_health(url):
        print("Hub healthcheck passed.")
        return True

    print("Hub is not reachable. Start it with: bun run server")
    return False


def wait_for_controller_on_hub(*, device_id: str, hub_port: int) -> bool:
    target = f"ws://127.0.0.1:{hub_port}/ws/ui"
    print(f"Waiting up to {HUB_DEVICE_WAIT_SECONDS:.0f}s for {device_id} on {target}")

    try:
        return wait_for_device_message(device_id, hub_port)
    except OSError as error:
        print(f"Could not connect to hub WebSocket: {error}")
        print("Start the hub with: bun run server")
        return False


def wait_for_device_message(device_id: str, hub_port: int) -> bool:
    url = f"ws://127.0.0.1:{hub_port}/ws/ui"
    # The controller receives a LAN URL, while setup checks the hub locally.
    # Keeping those two addresses separate makes the multi-user WLAN case clear.
    with connect_to_hub(url) as websocket:
        deadline = time.monotonic() + HUB_DEVICE_WAIT_SECONDS
        while time.monotonic() < deadline:
            if message_contains_device(receive_hub_message(websocket), device_id):
                print("Controller appeared on the hub.")
                return True

    print("Controller did not appear yet. Reboot it, confirm WiFi, and keep the hub running.")
    return False


def request_health(url: str) -> bool:
    """Check the local Bun hub with a short timeout so setup never hangs."""
    try:
        with urllib.request.urlopen(url, timeout=HUB_HEALTH_TIMEOUT_SECONDS) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print(f"Healthcheck failed: {error}")
        return False


def resolve_ip_selection(selected: str | None, candidates: list[str]) -> str:
    if not selected:
        return candidates[0]
    if not selected.isdigit():
        return selected

    index = int(selected)
    if 1 <= index <= len(candidates):
        return candidates[index - 1]
    return ""


def print_host_ip_candidates(candidates: list[str]) -> None:
    print("\nHost IP candidates for the controller to reach this computer:")
    for index, candidate in enumerate(candidates, start=1):
        print(f"{index}. {candidate}")


def detect_primary_ip() -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
        except OSError:
            return None


def resolve_hostname_ips() -> list[str]:
    try:
        host_infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except socket.gaierror:
        return []
    return [
        address
        for *_, socket_address in host_infos
        if isinstance((address := socket_address[0]), str)
    ]


def is_lan_ip(ip: str | None) -> bool:
    return bool(ip) and not ip.startswith("127.") and not ip.startswith("169.254.")


def unique_items(values: list[str | None]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def message_contains_device(message: object, device_id: str) -> bool:
    hub_message = as_mapping(message)
    if hub_message is None:
        return False
    return device_matches(hub_message.get("device"), device_id) or devices_include(
        hub_message.get("devices"), device_id
    )


def device_matches(device: object, device_id: str) -> bool:
    parsed_device = as_mapping(device)
    return parsed_device is not None and parsed_device.get("deviceId") == device_id


def devices_include(devices: object, device_id: str) -> bool:
    if not isinstance(devices, list):
        return False
    return any(device_matches(item, device_id) for item in devices)


def receive_hub_message(websocket: HubWebSocket) -> object | None:
    try:
        message = websocket.recv(timeout=1.0)
    except (TimeoutError, OSError):
        return None
    return parse_hub_message(message)


def parse_hub_message(message: object) -> object | None:
    if not isinstance(message, str):
        return None

    try:
        return json.loads(message)
    except json.JSONDecodeError:
        return None


def connect_to_hub(url: str) -> HubWebSocketContext:
    """Use the `websockets` library instead of maintaining protocol code here."""
    module = importlib.import_module("websockets.sync.client")
    connect = cast(Callable[..., HubWebSocketContext], module.connect)
    return connect(url, open_timeout=2)


def as_mapping(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, Mapping):
        return None
    return cast(Mapping[str, object], value)
