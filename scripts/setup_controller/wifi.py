"""Detect the currently connected WiFi SSID for the setup assistant.

The setup flow only needs a best-effort default value for the human prompt. This
module stays dependency-free and uses common OS tools on macOS, Linux, and
Windows. Detection failures deliberately return `None` so users can type the
SSID manually without the TUI failing.
"""

from __future__ import annotations

import platform
import subprocess

COMMAND_TIMEOUT_SECONDS = 2.0
MACOS_AIRPORT_PATH = (
    "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
)


def detect_current_wifi_ssid() -> str | None:
    """Return the active WLAN SSID when the host OS exposes it."""
    system = platform.system().lower()
    if system == "darwin":
        return detect_macos_ssid()
    if system == "linux":
        return detect_linux_ssid()
    if system == "windows":
        return detect_windows_ssid()
    return None


def detect_macos_ssid() -> str | None:
    interfaces = detect_macos_wifi_interfaces()
    for interface in interfaces:
        output = run_command(["networksetup", "-getairportnetwork", interface])
        ssid = parse_macos_networksetup_ssid(output)
        if ssid:
            return ssid
    return parse_macos_airport_ssid(run_command([macos_airport_path(), "-I"]))


def detect_linux_ssid() -> str | None:
    ssid = first_non_empty_line(run_command(["iwgetid", "-r"]))
    if ssid:
        return ssid
    return parse_linux_nmcli_ssid(run_command(["nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi"]))


def detect_windows_ssid() -> str | None:
    return parse_windows_netsh_ssid(run_command(["netsh", "wlan", "show", "interfaces"]))


def detect_macos_wifi_interfaces() -> list[str]:
    output = run_command(["networksetup", "-listallhardwareports"])
    interfaces: list[str] = []
    is_wifi_port = False
    for line in output.splitlines():
        if line.startswith("Hardware Port:"):
            is_wifi_port = line.rsplit(":", maxsplit=1)[-1].strip() in {"Wi-Fi", "AirPort"}
        elif is_wifi_port and line.startswith("Device:"):
            interfaces.append(line.rsplit(":", maxsplit=1)[-1].strip())
            is_wifi_port = False
    return interfaces


def parse_macos_networksetup_ssid(output: str) -> str | None:
    prefix = "Current Wi-Fi Network:"
    if prefix not in output:
        return None
    return optional_text(output.split(prefix, maxsplit=1)[-1])


def parse_macos_airport_ssid(output: str) -> str | None:
    for line in output.splitlines():
        key, _, value = line.partition(":")
        if key.strip() == "SSID":
            return optional_text(value)
    return None


def parse_linux_nmcli_ssid(output: str) -> str | None:
    for line in output.splitlines():
        active, _, ssid = line.partition(":")
        if active == "yes":
            return optional_text(ssid.replace(r"\:", ":"))
    return None


def parse_windows_netsh_ssid(output: str) -> str | None:
    for line in output.splitlines():
        key, _, value = line.partition(":")
        if key.strip() == "SSID":
            return optional_text(value)
    return None


def first_non_empty_line(output: str) -> str | None:
    for line in output.splitlines():
        value = optional_text(line)
        if value:
            return value
    return None


def optional_text(value: str) -> str | None:
    text = value.strip()
    return text or None


def macos_airport_path() -> str:
    return MACOS_AIRPORT_PATH


def run_command(command: list[str]) -> str:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except (FileNotFoundError, OSError, subprocess.SubprocessError):
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout
