"""Send the existing USB serial provisioning frame to the controller.

This module uses pySerial only for the serial I/O boundary. It writes one
newline-delimited `configure` JSON object and waits for the firmware's existing
`configureResult` response without logging the WiFi password.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

DEFAULT_BAUD_RATE = 115200
CONFIGURE_RESULT_TIMEOUT_SECONDS = 8.0


@dataclass(frozen=True)
class ProvisioningInput:
    port: str
    ssid: str
    password: str
    server_url: str
    device_id: str


@dataclass(frozen=True)
class ConfigureResult:
    ok: bool
    message: str


def send_configure_request(serial_module: Any, input_data: ProvisioningInput) -> ConfigureResult:
    request = build_configure_request(input_data)
    print_safe_request(input_data, request)

    deadline = time.monotonic() + CONFIGURE_RESULT_TIMEOUT_SECONDS
    try:
        with serial_module.Serial(
            input_data.port, DEFAULT_BAUD_RATE, timeout=0.5, write_timeout=2
        ) as serial_port:
            return write_and_wait(serial_port, request, deadline)
    except serial_module.SerialException as error:
        print(f"Could not use serial port {input_data.port}: {error}")
        print("Close browser Web Serial sessions or serial monitors, reconnect USB, then retry.")
        return ConfigureResult(False, "Serial port error")


def build_configure_request(input_data: ProvisioningInput) -> dict[str, str]:
    return {
        "type": "configure",
        "ssid": input_data.ssid,
        "password": input_data.password,
        "serverUrl": input_data.server_url,
        "deviceId": input_data.device_id,
    }


def write_and_wait(serial_port: Any, request: dict[str, str], deadline: float) -> ConfigureResult:
    time.sleep(0.2)
    serial_port.reset_input_buffer()
    serial_port.write(json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\n")
    serial_port.flush()

    while time.monotonic() < deadline:
        result = read_result_line(serial_port)
        if result:
            return result
    return ConfigureResult(False, "Timed out waiting for configureResult")


def read_result_line(serial_port: Any) -> ConfigureResult | None:
    raw_line = serial_port.readline()
    if not raw_line:
        return None

    result = parse_configure_result(raw_line)
    if result:
        return result

    text = raw_line.decode("utf-8", errors="replace").strip()
    if text:
        print(f"Ignoring controller frame: {text[:180]}")
    return None


def parse_configure_result(raw_line: bytes) -> ConfigureResult | None:
    try:
        parsed = json.loads(raw_line.decode("utf-8").strip())
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict) or parsed.get("type") != "configureResult":
        return None
    return ConfigureResult(ok=bool(parsed.get("ok")), message=str(parsed.get("message") or ""))


def print_safe_request(input_data: ProvisioningInput, request: dict[str, str]) -> None:
    safe_request = {key: value for key, value in request.items() if key != "password"}
    print(f"\nOpening {input_data.port} at {DEFAULT_BAUD_RATE} baud.")
    print(f"Sending configure frame: {json.dumps(safe_request, ensure_ascii=False)}")
