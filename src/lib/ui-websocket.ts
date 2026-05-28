import type { DeviceSnapshot } from "./device-state";
import {
  type DeviceCommandType,
  type DeviceMessage,
  type ProtocolError,
  type UiCommandMessage,
  validateDeviceMessage,
} from "./protocol";

const DEFAULT_HUB_PORT = "8787";
const UI_WEBSOCKET_PATH = "/ws/ui";
const DEVICE_WEBSOCKET_PATH = "/ws/device";
const HUB_URL_QUERY_PARAM = "hubUrl";
const HUB_PORT_QUERY_PARAM = "hubPort";
const DEVICE_HOST_QUERY_PARAM = "deviceHost";

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

export interface UiWebSocketUrlOptions {
  hubUrl?: string;
  hubPort?: string;
}

export interface DeviceWebSocketUrlOptions extends UiWebSocketUrlOptions {
  deviceHost?: string;
}

export function createUiWebSocketUrl(
  location: Location,
  options: UiWebSocketUrlOptions = {},
): string {
  const locationUrl = new URL(location.href);
  const queryHubUrl = normalizeHubUrl(locationUrl.searchParams.get(HUB_URL_QUERY_PARAM));

  if (queryHubUrl) {
    return queryHubUrl;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const queryHubPort = normalizeHubPort(locationUrl.searchParams.get(HUB_PORT_QUERY_PARAM));

  if (queryHubPort) {
    return `${protocol}//${location.hostname}:${queryHubPort}${UI_WEBSOCKET_PATH}`;
  }

  const configuredHubUrl = normalizeHubUrl(options.hubUrl);

  if (configuredHubUrl) {
    return configuredHubUrl;
  }

  const hubPort = normalizeHubPort(options.hubPort);

  return `${protocol}//${location.hostname}:${hubPort ?? DEFAULT_HUB_PORT}${UI_WEBSOCKET_PATH}`;
}

export function createDeviceWebSocketUrl(
  location: Location,
  options: DeviceWebSocketUrlOptions = {},
): string {
  const locationUrl = new URL(location.href);
  // The controller runs on the M5, so browser loopback hosts would point at the
  // wrong machine. Guided setup passes a LAN host through PUBLIC_M5_DEVICE_HOST.
  const deviceHost =
    normalizeDeviceHost(locationUrl.searchParams.get(DEVICE_HOST_QUERY_PARAM)) ??
    normalizeDeviceHost(options.deviceHost) ??
    normalizeDeviceHost(location.hostname);

  if (!deviceHost) {
    return "";
  }

  const hubUrl = new URL(createUiWebSocketUrl(location, options));
  return `${hubUrl.protocol}//${deviceHost}:${hubUrl.port || DEFAULT_HUB_PORT}${DEVICE_WEBSOCKET_PATH}`;
}

export function createUiCommand(type: DeviceCommandType, deviceId: string): UiCommandMessage {
  return { type, deviceId };
}

export function parseUiServerMessage(rawMessage: string): UiServerMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(rawMessage);

    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return undefined;
    }

    if (parsed.type === "snapshot" && isDeviceSnapshotArray(parsed.devices)) {
      return { type: "snapshot", devices: parsed.devices };
    }

    if (
      parsed.type === "deviceUpdate" &&
      isDeviceSnapshot(parsed.device) &&
      isDeviceMessage(parsed.message) &&
      isFiniteNumber(parsed.receivedAt) &&
      isFiniteNumber(parsed.sequenceGap)
    ) {
      return {
        type: "deviceUpdate",
        device: parsed.device,
        message: parsed.message,
        receivedAt: parsed.receivedAt,
        sequenceGap: parsed.sequenceGap,
      };
    }

    if (parsed.type === "deviceStatus" && isDeviceSnapshot(parsed.device)) {
      return { type: "deviceStatus", device: parsed.device };
    }

    if (parsed.type === "error" && isProtocolError(parsed.error)) {
      return { type: "error", error: parsed.error };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeHubUrl(rawHubUrl: string | undefined | null): string | undefined {
  const trimmedHubUrl = rawHubUrl?.trim();

  if (!trimmedHubUrl) {
    return undefined;
  }

  try {
    const hubUrl = new URL(trimmedHubUrl);
    if (hubUrl.protocol !== "ws:" && hubUrl.protocol !== "wss:") {
      return undefined;
    }

    if (hubUrl.pathname === "/") {
      hubUrl.pathname = UI_WEBSOCKET_PATH;
    }

    return hubUrl.toString();
  } catch {
    return undefined;
  }
}

function normalizeHubPort(rawHubPort: string | undefined | null): string | undefined {
  const trimmedHubPort = rawHubPort?.trim();

  if (!trimmedHubPort || !/^\d+$/.test(trimmedHubPort)) {
    return undefined;
  }

  const hubPort = Number(trimmedHubPort);
  if (!Number.isInteger(hubPort) || hubPort < 1 || hubPort > 65_535) {
    return undefined;
  }

  return String(hubPort);
}

function normalizeDeviceHost(rawDeviceHost: string | undefined | null): string | undefined {
  const deviceHost = rawDeviceHost?.trim();

  if (!deviceHost || isLoopbackHost(deviceHost) || deviceHost.includes("/")) {
    return undefined;
  }

  return deviceHost;
}

function isLoopbackHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === "localhost" || normalizedHost === "::1" || normalizedHost.startsWith("127.")
  );
}

function isDeviceSnapshotArray(value: unknown): value is DeviceSnapshot[] {
  return Array.isArray(value) && value.every(isDeviceSnapshot);
}

function isDeviceSnapshot(value: unknown): value is DeviceSnapshot {
  return (
    isRecord(value) &&
    hasDeviceConnectionFields(value) &&
    hasDeviceTimingFields(value) &&
    hasDeviceSequenceFields(value) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isNonEmptyString)
  );
}

function hasDeviceConnectionFields(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.deviceId) &&
    typeof value.connected === "boolean" &&
    typeof value.safeMode === "boolean"
  );
}

function hasDeviceTimingFields(value: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(value.lastMessageAt) &&
    (value.lastTelemetryAt === null || isFiniteNumber(value.lastTelemetryAt)) &&
    (value.lastHeartbeatAt === null || isFiniteNumber(value.lastHeartbeatAt)) &&
    (value.heartbeatAgeMs === null || isFiniteNumber(value.heartbeatAgeMs)) &&
    (value.telemetryAgeMs === null || isFiniteNumber(value.telemetryAgeMs))
  );
}

function hasDeviceSequenceFields(value: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(value.lastSeq) &&
    isFiniteNumber(value.expectedSeq) &&
    isFiniteNumber(value.receivedMessages) &&
    isFiniteNumber(value.lostMessages) &&
    isFiniteNumber(value.packetLossEstimate) &&
    isFiniteNumber(value.invalidSequenceCount)
  );
}

function isDeviceMessage(value: unknown): value is DeviceMessage {
  return isRecord(value) && validateDeviceMessage(value).ok;
}

function isProtocolError(value: unknown): value is ProtocolError {
  return (
    isRecord(value) &&
    (value.code === "invalid_json" ||
      value.code === "invalid_shape" ||
      value.code === "unknown_type") &&
    isNonEmptyString(value.message)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class UiTelemetrySocket {
  readonly #url: string;
  readonly #reconnectDelayMs: number;
  readonly #listeners = {
    open: new Set<UiSocketEventListener<"open">>(),
    close: new Set<UiSocketEventListener<"close">>(),
    error: new Set<UiSocketEventListener<"error">>(),
    message: new Set<UiSocketEventListener<"message">>(),
  };
  #socket: WebSocket | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #shouldReconnect = false;

  constructor(url: string, reconnectDelayMs = 1_500) {
    this.#url = url;
    this.#reconnectDelayMs = reconnectDelayMs;
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
    this.#shouldReconnect = true;
    if (this.#socket && this.#socket.readyState < WebSocket.CLOSING) {
      return;
    }

    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.addEventListener("open", () => {
      this.#clearReconnectTimer();
      this.#emit("open", undefined);
    });
    socket.addEventListener("close", () => {
      if (this.#socket === socket) {
        this.#socket = undefined;
      }
      this.#emit("close", undefined);
      this.#scheduleReconnect();
    });
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
    this.#shouldReconnect = false;
    this.#clearReconnectTimer();
    this.#socket?.close();
    this.#socket = undefined;
  }

  #scheduleReconnect(): void {
    // Reconnect is safe here because the UI reconnects to the same explicit hub URL.
    if (!this.#shouldReconnect || this.#reconnectTimer) {
      return;
    }

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.connect();
    }, this.#reconnectDelayMs);
  }

  #clearReconnectTimer(): void {
    if (!this.#reconnectTimer) {
      return;
    }

    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }

  #emit<T extends keyof UiSocketEventMap>(eventName: T, payload: UiSocketEventMap[T]): void {
    for (const listener of this.#listeners[eventName]) {
      listener(payload as never);
    }
  }
}
