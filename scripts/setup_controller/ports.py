"""Serial port discovery for M5StickC Plus2 USB setup.

The selection logic mirrors the existing probe script's macOS preference for
`/dev/cu.*` ports and highlights CH9102/WCH/M5-looking devices while still
allowing manual paths for unusual systems.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any

from .prompts import prompt_optional

M5_PORT_HINTS = (
    "usbserial",
    "wchusbserial",
    "usbmodem",
    "ch9102",
    "wch",
    "qinheng",
    "m5",
)


@dataclass(frozen=True)
class SerialPortChoice:
    device: str
    description: str
    hwid: str
    likely_m5: bool


def choose_serial_port(list_ports_module: Any) -> str | None:
    ports = find_serial_ports(list_ports_module)
    if not ports:
        return prompt_optional("Serial port path")

    print("Visible serial ports:")
    for index, port in enumerate(ports, start=1):
        print_port(index, port)

    default_index = first_likely_port_index(ports)
    selected = prompt_optional(f"Serial port number or path [{default_index}]")
    return resolve_port_selection(selected, ports, default_index)


def find_serial_ports(list_ports_module: Any) -> list[SerialPortChoice]:
    choices: list[SerialPortChoice] = []
    for port in sorted(
        list_ports_module.comports(include_links=True), key=lambda item: item.device
    ):
        if sys.platform == "darwin" and not port.device.startswith("/dev/cu."):
            continue
        choices.append(to_choice(port))
    return sorted(choices, key=lambda item: (not item.likely_m5, item.device))


def resolve_port_selection(
    selected: str | None,
    ports: list[SerialPortChoice],
    default_index: int,
) -> str | None:
    if not selected:
        return ports[default_index - 1].device
    if not selected.isdigit():
        return selected

    index = int(selected)
    if 1 <= index <= len(ports):
        return ports[index - 1].device
    print("Invalid port number.")
    return choose_serial_port_from_existing(ports)


def choose_serial_port_from_existing(ports: list[SerialPortChoice]) -> str | None:
    default_index = first_likely_port_index(ports)
    selected = prompt_optional(f"Serial port number or path [{default_index}]")
    return resolve_port_selection(selected, ports, default_index)


def to_choice(port: Any) -> SerialPortChoice:
    searchable = f"{port.device} {port.description} {port.hwid}".lower()
    return SerialPortChoice(
        device=port.device,
        description=port.description or "Unknown serial device",
        hwid=port.hwid or "",
        likely_m5=any(hint in searchable for hint in M5_PORT_HINTS),
    )


def first_likely_port_index(ports: list[SerialPortChoice]) -> int:
    return next((index for index, port in enumerate(ports, start=1) if port.likely_m5), 1)


def print_port(index: int, port: SerialPortChoice) -> None:
    marker = "likely M5" if port.likely_m5 else "other"
    print(f"{index}. {port.device} ({marker})")
    print(f"   {port.description} {port.hwid}".strip())
