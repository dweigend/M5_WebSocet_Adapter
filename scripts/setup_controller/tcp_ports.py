"""Find available TCP ports for the local setup assistant.

The setup flow starts both the WebSocket hub and the SvelteKit dev server. This
module keeps port probing small and explicit so occupied defaults can be avoided
before child processes are launched.
"""

from __future__ import annotations

import socket

MAX_PORT = 65535
PORT_SCAN_LIMIT = 50


def choose_available_port(preferred_port: int) -> int:
    """Return the preferred port or the next available TCP port nearby."""
    for port in candidate_ports(preferred_port):
        if is_tcp_port_available(port):
            return port
    return bind_ephemeral_port()


def candidate_ports(preferred_port: int) -> list[int]:
    if not is_valid_port(preferred_port):
        preferred_port = 0
    if preferred_port == 0:
        return []
    last_port = min(MAX_PORT, preferred_port + PORT_SCAN_LIMIT)
    return list(range(preferred_port, last_port + 1))


def is_tcp_port_available(port: int) -> bool:
    if not is_valid_port(port):
        return False

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server_socket.bind(("", port))
        except OSError:
            return False
    return True


def bind_ephemeral_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.bind(("", 0))
        return int(server_socket.getsockname()[1])


def is_valid_port(port: int) -> bool:
    return 1 <= port <= MAX_PORT
