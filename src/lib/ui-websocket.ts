import type { DeviceSnapshot } from "./device-state";
import type { DeviceCommandType, DeviceMessage, ProtocolError, UiCommandMessage } from "./protocol";

export type UiServerMessage =
  | { type: "snapshot"; devices: DeviceSnapshot[] }
  | {
      type: "deviceUpdate";
      device: DeviceSnapshot;
      message: DeviceMessage;
      receivedAt: number;
      sequenceGap: number;
    }
  | { type: "deviceStatus"; device: DeviceSnapshot }
  | { type: "error"; error: ProtocolError };

export interface UiSocketEventMap {
  open: undefined;
  close: undefined;
  error: string;
  message: UiServerMessage;
}

type UiSocketEventListener<T extends keyof UiSocketEventMap> = (
  payload: UiSocketEventMap[T],
) => void;

export function createUiWebSocketUrl(location: Location): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.hostname}:8787/ws/ui`;
}

export function createUiCommand(type: DeviceCommandType, deviceId: string): UiCommandMessage {
  return { type, deviceId };
}

export function parseUiServerMessage(rawMessage: string): UiServerMessage | undefined {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<UiServerMessage>;

    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return undefined;
    }

    if (parsed.type === "snapshot" && Array.isArray(parsed.devices)) {
      return parsed as UiServerMessage;
    }

    if (
      (parsed.type === "deviceUpdate" || parsed.type === "deviceStatus") &&
      "device" in parsed &&
      parsed.device
    ) {
      return parsed as UiServerMessage;
    }

    if (parsed.type === "error" && "error" in parsed && parsed.error) {
      return parsed as UiServerMessage;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export class UiTelemetrySocket {
  readonly #url: string;
  readonly #listeners = {
    open: new Set<UiSocketEventListener<"open">>(),
    close: new Set<UiSocketEventListener<"close">>(),
    error: new Set<UiSocketEventListener<"error">>(),
    message: new Set<UiSocketEventListener<"message">>(),
  };
  #socket: WebSocket | undefined;

  constructor(url: string) {
    this.#url = url;
  }

  get connected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  on<T extends keyof UiSocketEventMap>(
    eventName: T,
    listener: UiSocketEventListener<T>,
  ): () => void {
    this.#listeners[eventName].add(listener as never);
    return () => this.#listeners[eventName].delete(listener as never);
  }

  connect(): void {
    if (this.#socket && this.#socket.readyState < WebSocket.CLOSING) {
      return;
    }

    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.addEventListener("open", () => this.#emit("open", undefined));
    socket.addEventListener("close", () => this.#emit("close", undefined));
    socket.addEventListener("error", () => this.#emit("error", "WebSocket connection failed."));
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        this.#emit("error", "WebSocket message was not text.");
        return;
      }

      const message = parseUiServerMessage(event.data);
      if (!message) {
        this.#emit("error", "WebSocket message had an unknown shape.");
        return;
      }

      this.#emit("message", message);
    });
  }

  sendCommand(command: UiCommandMessage): void {
    if (!this.connected || !this.#socket) {
      throw new Error("WebSocket is not connected.");
    }

    this.#socket.send(JSON.stringify(command));
  }

  disconnect(): void {
    this.#socket?.close();
    this.#socket = undefined;
  }

  #emit<T extends keyof UiSocketEventMap>(eventName: T, payload: UiSocketEventMap[T]): void {
    for (const listener of this.#listeners[eventName]) {
      listener(payload as never);
    }
  }
}
