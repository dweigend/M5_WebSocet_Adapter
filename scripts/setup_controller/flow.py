"""Coordinate the clone-to-running-site controller setup flow.

The flow stays deliberately linear: prepare local tools, optionally upload
firmware, provision over the existing USB JSON protocol, run repo checks, then
start the local hub and SvelteKit UI for manual inspection.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from dataclasses import dataclass

from .commands import (
    CommandResult,
    ensure_bun_dependencies,
    ensure_controller_tools,
    run_verification_checks,
    start_bun_server,
    start_website,
    upload_firmware,
)
from .config import (
    CONFIG_PATH,
    SetupConfig,
    load_config,
    record_controller,
    save_config,
    suggest_next_device_id,
    with_computer_id,
)
from .network import check_hub_health, choose_host_ip, wait_for_controller_on_hub
from .ports import choose_serial_port
from .prompts import (
    confirm,
    prompt_default,
    prompt_int,
    prompt_password,
    prompt_required,
)
from .serial_provision import ProvisioningInput, send_configure_request
from .tcp_ports import choose_available_port

DEFAULT_UI_PORT = 5173


@dataclass(frozen=True)
class SetupInput:
    port: str
    device_id: str
    ssid: str
    password: str
    hub_port: int
    ui_port: int
    host_ip: str

    @property
    def server_url(self) -> str:
        return f"ws://{self.host_ip}:{self.hub_port}/ws/device"


def main() -> int:
    print("M5StickC Plus2 Controller Setup")
    print("Fresh clone flow: dependencies, firmware, USB setup, checks, hub, UI.\n")

    if not prepare_environment():
        return 1
    config = collect_config_identity(load_config())
    if not maybe_upload_firmware():
        return 1

    setup_input = collect_setup_input(config)
    if not confirm_setup(setup_input):
        print("Cancelled before writing to the controller.")
        return 1

    if not provision_controller(setup_input):
        return 1

    persist_controller(config, setup_input)
    if not run_checks():
        return 1
    start_runtime(setup_input)
    return 0


def prepare_environment() -> bool:
    if not run_optional_setup_step(
        "Run bun install for a freshly cloned repo?",
        ensure_bun_dependencies,
    ):
        return False
    return run_optional_setup_step(
        "Install/update pinned controller tools with uv?",
        ensure_controller_tools,
    )


def run_optional_setup_step(prompt: str, action: Callable[[], CommandResult]) -> bool:
    if not confirm(prompt, default=True):
        return True
    return action().ok


def collect_config_identity(config: SetupConfig) -> SetupConfig:
    computer_id = prompt_default("Computer ID", config.computer_id)
    return with_computer_id(config, computer_id)


def collect_setup_input(config: SetupConfig) -> SetupInput:
    list_ports_module = importlib.import_module("serial.tools.list_ports")
    port = choose_serial_port(list_ports_module)
    if not port:
        raise SystemExit("No serial port selected. Connect the controller over USB and try again.")

    available_hub_port = choose_available_port(config.default_hub_port)
    hub_port = prompt_int("Hub port", available_hub_port)
    if hub_port != available_hub_port:
        hub_port = choose_available_port(hub_port)

    ui_port = choose_available_port(DEFAULT_UI_PORT)
    return SetupInput(
        port=port,
        device_id=prompt_default("Controller ID", suggest_next_device_id(config)),
        ssid=prompt_required("WiFi SSID"),
        password=prompt_password(),
        hub_port=hub_port,
        ui_port=ui_port,
        host_ip=choose_host_ip(),
    )


def confirm_setup(input_data: SetupInput) -> bool:
    print("\nConfiguration to send:")
    print(f"- Serial port: {input_data.port}")
    print(f"- Controller ID: {input_data.device_id}")
    print(f"- WiFi SSID: {input_data.ssid}")
    print(f"- Hub URL: {input_data.server_url}")
    print(f"- Browser UI: http://localhost:{input_data.ui_port}/")
    return confirm("Send this configuration over USB?", default=True)


def maybe_upload_firmware() -> bool:
    if not confirm("Upload firmware before provisioning?", default=False):
        return True
    result = upload_firmware()
    return result.ok


def provision_controller(input_data: SetupInput) -> bool:
    serial_module = importlib.import_module("serial")
    result = send_configure_request(serial_module, to_provisioning_input(input_data))
    if result.ok:
        print(f"Controller response: {result.message or 'Configuration saved'}")
        return True
    print(f"Controller rejected configuration: {result.message or 'Unknown error'}")
    return False


def persist_controller(config: SetupConfig, input_data: SetupInput) -> None:
    next_config = record_controller(
        config,
        device_id=input_data.device_id,
        ssid=input_data.ssid,
        hub_port=input_data.hub_port,
    )
    save_config(next_config)
    print(f"Saved local setup metadata to {CONFIG_PATH}")


def run_checks() -> bool:
    if not confirm("Run repo checks now?", default=True):
        return True

    results = run_verification_checks()
    failed = [result.label for result in results if not result.ok]
    if failed:
        print(f"Checks failed: {', '.join(failed)}")
        return False
    print("All checks passed.")
    return True


def start_runtime(input_data: SetupInput) -> None:
    if confirm("Start Bun WebSocket hub now?", default=True):
        start_bun_server(input_data.hub_port)
    check_hub_health(input_data.hub_port)
    if confirm("Wait for this controller to appear on the hub?", default=True):
        wait_for_controller_on_hub(device_id=input_data.device_id, hub_port=input_data.hub_port)
    if confirm("Start SvelteKit website now?", default=True):
        start_website(
            ui_port=input_data.ui_port,
            hub_port=input_data.hub_port,
            device_host=input_data.host_ip,
        )
        print(f"Open http://localhost:{input_data.ui_port}/ in the browser.")


def to_provisioning_input(input_data: SetupInput) -> ProvisioningInput:
    return ProvisioningInput(
        port=input_data.port,
        ssid=input_data.ssid,
        password=input_data.password,
        server_url=input_data.server_url,
        device_id=input_data.device_id,
    )
