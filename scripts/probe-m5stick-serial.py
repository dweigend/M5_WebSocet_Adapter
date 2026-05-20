#!/usr/bin/env python3
"""Probe an M5StickC Plus2 serial port without browser dependencies.

The script uses only the Python standard library so it can run before project
dependencies are installed. It opens a macOS/Linux serial device, captures raw
bytes and newline-delimited text, tries to parse JSON frames, and can send a
small set of harmless diagnostic JSON requests.
"""

from __future__ import annotations

import argparse
import errno
import glob
import json
import os
import re
import select
import signal
import subprocess
import sys
import termios
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


DEFAULT_BAUD_RATES = [115200, 9600, 57600, 38400, 19200, 230400, 1500000]
DEFAULT_PROBES = [
    {"type": "statusRequest"},
    {"type": "getConfig"},
    {"type": "startTelemetry"},
]

BAUD_CONSTANTS = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
    230400: getattr(termios, "B230400", None),
    460800: getattr(termios, "B460800", None),
    921600: getattr(termios, "B921600", None),
    1500000: getattr(termios, "B1500000", None),
}


@dataclass
class ProbeStats:
    bytes_read: int = 0
    lines: int = 0
    json_lines: int = 0
    invalid_json_lines: int = 0
    device_frames: int = 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="Serial device path, for example /dev/cu.usbserial-...")
    parser.add_argument(
        "--baud",
        type=int,
        action="append",
        help="Baud rate to try. Can be passed more than once. Defaults to M5-documented rates.",
    )
    parser.add_argument("--seconds", type=float, default=8.0, help="Read duration per baud rate.")
    parser.add_argument(
        "--write-probes",
        action="store_true",
        help="Send statusRequest/getConfig/startTelemetry JSON probes after opening the port.",
    )
    parser.add_argument(
        "--log-dir",
        default="serial-probe-logs",
        help="Directory for raw byte and decoded line captures.",
    )
    args = parser.parse_args()

    print_doc_grounding()
    print_host_inventory()

    port = args.port or choose_default_port()
    if not port:
        print("No likely serial port found. Pass --port /dev/cu.usbserial-... explicitly.")
        return 2

    baud_rates = args.baud or DEFAULT_BAUD_RATES
    log_dir = Path(args.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nSelected port: {port}")
    print_port_owner(port)

    overall_stats = ProbeStats()
    for baud_rate in baud_rates:
        stats = probe_port(
            port=port,
            baud_rate=baud_rate,
            seconds=args.seconds,
            write_probes=args.write_probes,
            log_dir=log_dir,
        )
        overall_stats.bytes_read += stats.bytes_read
        overall_stats.lines += stats.lines
        overall_stats.json_lines += stats.json_lines
        overall_stats.invalid_json_lines += stats.invalid_json_lines
        overall_stats.device_frames += stats.device_frames

        if stats.device_frames > 0:
            print("\nDevice JSON frames found; stopping baud scan.")
            break

    print_summary(overall_stats)
    return 0 if overall_stats.bytes_read > 0 else 1


def print_doc_grounding() -> None:
    print("M5 documentation grounding:")
    print("- StickC Plus2 uses ESP32-PICO-V3-02 and CH9102 USB-UART.")
    print("- M5 PlatformIO example sets monitor_speed = 115200.")
    print("- M5 Arduino guide says to install the CH9102/CP34X driver and select the USB port.")
    print("- Official docs: https://docs.m5stack.com/en/core/M5StickC%20PLUS2")
    print("- Arduino guide: https://docs.m5stack.com/en/arduino/m5stickc_plus2/program")


def print_host_inventory() -> None:
    print("\nVisible serial devices:")
    for path in find_serial_ports():
        print(f"- {path}")

    usb_summary = run_command(
        [
            "system_profiler",
            "SPUSBDataType",
        ],
        timeout=8,
    )
    matches = [
        line.rstrip()
        for line in usb_summary.splitlines()
        if re.search(r"CH9102|USB Single Serial|usbserial|M5|QinHeng|WCH|1A86|55D4", line, re.I)
    ]
    if matches:
        print("\nUSB profiler matches:")
        for line in matches[:40]:
            print(line)


def choose_default_port() -> str | None:
    preferred_patterns = [
        "/dev/cu.usbserial*",
        "/dev/cu.wchusbserial*",
        "/dev/cu.usbmodem*",
        "/dev/tty.usbserial*",
        "/dev/tty.wchusbserial*",
        "/dev/tty.usbmodem*",
    ]
    for pattern in preferred_patterns:
        matches = sorted(glob.glob(pattern))
        if matches:
            return matches[0]
    return None


def find_serial_ports() -> list[str]:
    patterns = ["/dev/cu.*", "/dev/tty.*"]
    ports: list[str] = []
    for pattern in patterns:
        ports.extend(glob.glob(pattern))
    return sorted(ports)


def print_port_owner(port: str) -> None:
    owner_output = run_command(["lsof", port], timeout=5)
    if owner_output.strip():
        print("\nCurrent port owner:")
        print(owner_output.rstrip())
    else:
        print("\nNo current lsof owner found for selected port.")


def probe_port(
    *,
    port: str,
    baud_rate: int,
    seconds: float,
    write_probes: bool,
    log_dir: Path,
) -> ProbeStats:
    print(f"\n--- Probe {port} at {baud_rate} baud for {seconds:.1f}s ---")
    stats = ProbeStats()
    raw_log_path = log_dir / f"{safe_name(port)}-{baud_rate}.raw.bin"
    line_log_path = log_dir / f"{safe_name(port)}-{baud_rate}.lines.txt"

    try:
        fd = open_serial_port(port, baud_rate)
    except OSError as error:
        explain_open_error(port, error)
        return stats

    interrupted = False

    def handle_interrupt(_signum: int, _frame: object) -> None:
        nonlocal interrupted
        interrupted = True

    previous_handler = signal.signal(signal.SIGINT, handle_interrupt)
    try:
        if write_probes:
            write_probe_messages(fd)

        started_at = time.monotonic()
        buffer = b""
        with raw_log_path.open("ab") as raw_log, line_log_path.open("a", encoding="utf-8") as line_log:
            while not interrupted and time.monotonic() - started_at < seconds:
                readable, _, _ = select.select([fd], [], [], 0.2)
                if not readable:
                    continue

                chunk = os.read(fd, 4096)
                if not chunk:
                    continue

                stats.bytes_read += len(chunk)
                raw_log.write(chunk)
                buffer += chunk

                while b"\n" in buffer:
                    raw_line, buffer = buffer.split(b"\n", 1)
                    handle_line(raw_line.rstrip(b"\r"), stats, line_log)

            if buffer:
                handle_line(buffer.rstrip(b"\r"), stats, line_log)
    finally:
        signal.signal(signal.SIGINT, previous_handler)
        os.close(fd)

    print(
        "Result: "
        f"{stats.bytes_read} bytes, {stats.lines} lines, "
        f"{stats.json_lines} JSON lines, {stats.device_frames} device frames, "
        f"{stats.invalid_json_lines} invalid text lines."
    )
    print(f"Logs: {raw_log_path} and {line_log_path}")
    return stats


def open_serial_port(port: str, baud_rate: int) -> int:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial_fd(fd, baud_rate)
        try:
            os.set_blocking(fd, False)
        except AttributeError:
            pass
        return fd
    except Exception:
        os.close(fd)
        raise


def configure_serial_fd(fd: int, baud_rate: int) -> None:
    baud_constant = BAUD_CONSTANTS.get(baud_rate)
    if baud_constant is None:
        raise OSError(errno.EINVAL, f"Unsupported baud rate in Python termios: {baud_rate}")

    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = baud_constant | termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    attrs[4] = baud_constant
    attrs[5] = baud_constant
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)


def write_probe_messages(fd: int) -> None:
    print("Writing diagnostic probes: blank line, statusRequest, getConfig, startTelemetry.")
    os.write(fd, b"\n")
    time.sleep(0.2)
    for message in DEFAULT_PROBES:
        os.write(fd, json.dumps(message, separators=(",", ":")).encode("utf-8") + b"\n")
        time.sleep(0.2)


def handle_line(raw_line: bytes, stats: ProbeStats, line_log) -> None:
    if not raw_line:
        return

    stats.lines += 1
    text = raw_line.decode("utf-8", errors="replace")
    line_log.write(text + "\n")

    parsed = try_parse_json(text)
    if parsed is None:
        stats.invalid_json_lines += 1
        print(f"TEXT[{stats.lines}]: {text[:220]}")
        return

    stats.json_lines += 1
    if isinstance(parsed, dict) and parsed.get("type") in {
        "register",
        "heartbeat",
        "imu",
        "orientation",
        "configureResult",
        "statusResult",
        "configResult",
    }:
        stats.device_frames += 1
        print(f"JSON-FRAME[{stats.lines}]: {json.dumps(parsed, ensure_ascii=False)}")
    else:
        print(f"JSON-OTHER[{stats.lines}]: {json.dumps(parsed, ensure_ascii=False)}")


def try_parse_json(text: str) -> object | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def explain_open_error(port: str, error: OSError) -> None:
    print(f"Could not open {port}: {error}")
    if error.errno in {errno.EBUSY, errno.EACCES, errno.EPERM}:
        print("Likely causes:")
        print("- The browser still owns the Web Serial connection.")
        print("- Another serial monitor is open.")
        print("- The OS driver has not released the CH9102 port yet.")
        print("Close the browser serial session, then rerun this script.")


def print_summary(stats: ProbeStats) -> None:
    print("\n=== Summary ===")
    print(f"Bytes read: {stats.bytes_read}")
    print(f"Lines read: {stats.lines}")
    print(f"JSON lines: {stats.json_lines}")
    print(f"Device frames: {stats.device_frames}")
    print(f"Invalid text lines: {stats.invalid_json_lines}")
    if stats.bytes_read == 0:
        print("No bytes were captured. Check port ownership, firmware, baud rate, cable, and driver.")
    elif stats.device_frames == 0:
        print("Bytes arrived, but no expected telemetry JSON frames were seen.")


def run_command(command: Iterable[str], timeout: float) -> str:
    try:
        completed = subprocess.run(
            list(command),
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
        )
        return completed.stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def safe_name(port: str) -> str:
    return port.strip("/").replace("/", "-").replace(".", "_")


if __name__ == "__main__":
    raise SystemExit(main())
