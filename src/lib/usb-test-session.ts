import { DeviceRegistry, type DeviceSnapshot } from "./device-state";
import {
  DEVICE_MESSAGE_TYPES,
  type DeviceCommandType,
  type DeviceMessage,
  type DeviceMessageType,
  parseDeviceMessage,
} from "./protocol";
import {
  type ConfigureRequest,
  type ConfigureResult,
  formatSerialTestResult,
  isWebSerialSupported,
  parseConfigureResult,
  SerialSetupConnection,
} from "./serial-setup";

export const RAW_SERIAL_LOG_LIMIT = 500;

const RATE_WINDOW_MS = 5_000;
const SETUP_FRAME_TYPES = ["configureResult"] as const;
const RAW_FRAME_TYPES = [...DEVICE_MESSAGE_TYPES, ...SETUP_FRAME_TYPES, "unsupported"] as const;

export type UsbRawFrameType = (typeof RAW_FRAME_TYPES)[number];

export interface RawSerialEntry {
  id: number;
  receivedAt: number;
  line: string;
  valid: boolean;
  frameType: UsbRawFrameType;
  parseError?: string;
}

export type UsbFrameCounters = Record<UsbRawFrameType, number>;

export interface UsbTestSessionState {
  supported: boolean;
  connected: boolean;
  busy: boolean;
  message: string;
  configureResult?: ConfigureResult;
  rawLines: RawSerialEntry[];
  frameCounters: UsbFrameCounters;
  validFrameCount: number;
  invalidLineCount: number;
  lastParseError?: string;
  lastFrameAt: number | null;
  telemetryRateHz: number;
  devices: DeviceSnapshot[];
}

type UsbStateListener = (state: UsbTestSessionState) => void;
type RawFrameInput = Omit<RawSerialEntry, "id">;

export class UsbTestSession {
  readonly #registry = new DeviceRegistry();
  readonly #listeners = new Set<UsbStateListener>();
  readonly #telemetryFrameTimes: number[] = [];
  #connection: SerialSetupConnection | undefined;
  #nextRawLineId = 1;
  #state: UsbTestSessionState = createInitialUsbState();

  get state(): UsbTestSessionState {
    return cloneUsbState(this.#state);
  }

  subscribe(listener: UsbStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  initialize(): void {
    this.#patchState({
      supported: isWebSerialSupported(),
      message: isWebSerialSupported()
        ? "Ready to connect a Stick over USB serial."
        : "Web Serial is unavailable in this browser.",
    });
  }

  async connect(): Promise<void> {
    if (!this.#state.supported || this.#state.busy || this.#state.connected) {
      return;
    }

    await this.#runSerialAction(async () => {
      const connection = new SerialSetupConnection();
      connection.subscribe((event) => {
        if (event.type === "configureResult") {
          this.ingestConfigureResult(event.result, Date.now());
          return;
        }

        if (event.type === "line") {
          this.ingestSerialLine(event.line, Date.now());
          return;
        }

        this.#patchState({ message: event.message });
      });

      await connection.connect();
      this.#connection = connection;
      this.#patchState({ connected: true, message: "Serial port connected." });
    }, "Could not connect serial port.");
  }

  async testConnection(): Promise<void> {
    if (!this.#state.supported || this.#state.busy || this.#state.connected) {
      return;
    }

    await this.#runSerialAction(async () => {
      const result = await SerialSetupConnection.testConnection();
      this.#patchState({ message: formatSerialTestResult(result) });
    }, "Could not test serial port.");
  }

  async disconnect(): Promise<void> {
    this.#patchState({ busy: true });

    try {
      await this.#connection?.disconnect();
    } finally {
      this.#connection = undefined;
      this.#patchState({
        connected: false,
        busy: false,
        message: this.#state.supported
          ? "Serial port disconnected."
          : "Web Serial is unavailable in this browser.",
      });
    }
  }

  async sendConfigure(request: ConfigureRequest): Promise<void> {
    if (!this.#connection || this.#state.busy) {
      return;
    }

    const connection = this.#connection;
    await this.#runSerialAction(async () => {
      await connection.sendConfigure(request);
      this.#patchState({
        configureResult: undefined,
        message: "Configure message sent. Waiting for device response.",
      });
    }, "Could not send configuration.");
  }

  async sendCommand(type: DeviceCommandType): Promise<void> {
    if (!this.#connection || !this.#state.connected) {
      throw new Error("USB serial is not connected.");
    }

    await this.#connection.sendCommand(type);
    this.#patchState({ message: `${type} sent over USB serial.` });
  }

  ingestSerialLine(line: string, receivedAt: number): void {
    const configureResult = parseConfigureResult(line);
    if (configureResult) {
      this.ingestConfigureResult(configureResult, receivedAt, line);
      return;
    }

    const parsedDeviceMessage = parseDeviceMessage(line);
    if (!parsedDeviceMessage.ok) {
      this.#recordInvalidLine(line, receivedAt, parsedDeviceMessage.error.message);
      return;
    }

    this.#recordDeviceMessage(line, parsedDeviceMessage.message, receivedAt);
  }

  ingestConfigureResult(
    result: ConfigureResult,
    receivedAt: number,
    rawLine = JSON.stringify(result),
  ): void {
    this.#patchState({
      ...this.#recordRawFrame({
        line: rawLine,
        receivedAt,
        valid: true,
        frameType: "configureResult",
      }),
      configureResult: result,
      message: result.message,
      lastFrameAt: receivedAt,
    });
  }

  refresh(timestamp: number): void {
    this.#patchState({
      devices: this.#registry.getAllSnapshots(timestamp),
      telemetryRateHz: calculateTelemetryRate(this.#telemetryFrameTimes, timestamp),
    });
  }

  clearRawLog(): void {
    this.#patchState({ rawLines: [] });
  }

  #recordDeviceMessage(line: string, message: DeviceMessage, receivedAt: number): void {
    const update = this.#registry.upsertFromMessage(message, receivedAt);
    if (isTelemetryFrame(message)) {
      this.#telemetryFrameTimes.push(receivedAt);
    }

    this.#patchState({
      ...this.#recordRawFrame({
        line,
        receivedAt,
        valid: true,
        frameType: message.type,
      }),
      devices: upsertDeviceSnapshot(this.#state.devices, update.snapshot),
      lastFrameAt: receivedAt,
      telemetryRateHz: calculateTelemetryRate(this.#telemetryFrameTimes, receivedAt),
      message: `USB telemetry received from ${message.deviceId}.`,
    });
  }

  #recordInvalidLine(line: string, receivedAt: number, parseError: string): void {
    this.#patchState({
      ...this.#recordRawFrame({
        line,
        receivedAt,
        valid: false,
        frameType: "unsupported",
        parseError,
      }),
      lastParseError: parseError,
      message: parseError,
    });
  }

  #recordRawFrame(input: RawFrameInput): Partial<UsbTestSessionState> {
    const rawEntry = this.#createRawEntry(input);

    if (!input.valid) {
      return {
        rawLines: prependRawLine(this.#state.rawLines, rawEntry),
        frameCounters: incrementFrameCounter(this.#state.frameCounters, input.frameType),
        invalidLineCount: this.#state.invalidLineCount + 1,
      };
    }

    return {
      rawLines: prependRawLine(this.#state.rawLines, rawEntry),
      frameCounters: incrementFrameCounter(this.#state.frameCounters, input.frameType),
      validFrameCount: this.#state.validFrameCount + 1,
    };
  }

  async #runSerialAction(action: () => Promise<void>, fallbackMessage: string): Promise<void> {
    this.#patchState({ busy: true });

    try {
      await action();
    } catch (error) {
      this.#connection = undefined;
      this.#patchState({
        connected: false,
        message: error instanceof Error ? error.message : fallbackMessage,
      });
    } finally {
      this.#patchState({ busy: false });
    }
  }

  #createRawEntry(input: RawFrameInput): RawSerialEntry {
    const id = this.#nextRawLineId;
    this.#nextRawLineId += 1;
    return { id, ...input };
  }

  #patchState(patch: Partial<UsbTestSessionState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#emit();
  }

  #emit(): void {
    const state = this.state;
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

export function createInitialUsbState(): UsbTestSessionState {
  return {
    supported: false,
    connected: false,
    busy: false,
    message: "Web Serial is checked after the page loads.",
    rawLines: [],
    frameCounters: createFrameCounters(),
    validFrameCount: 0,
    invalidLineCount: 0,
    lastFrameAt: null,
    telemetryRateHz: 0,
    devices: [],
  };
}

export function prependRawLine(
  rawLines: RawSerialEntry[],
  nextLine: RawSerialEntry,
  limit = RAW_SERIAL_LOG_LIMIT,
): RawSerialEntry[] {
  return [nextLine, ...rawLines].slice(0, limit);
}

function createFrameCounters(): UsbFrameCounters {
  return Object.fromEntries(RAW_FRAME_TYPES.map((frameType) => [frameType, 0])) as UsbFrameCounters;
}

function incrementFrameCounter(
  frameCounters: UsbFrameCounters,
  frameType: UsbRawFrameType,
): UsbFrameCounters {
  return { ...frameCounters, [frameType]: frameCounters[frameType] + 1 };
}

function upsertDeviceSnapshot(
  devices: DeviceSnapshot[],
  nextDevice: DeviceSnapshot,
): DeviceSnapshot[] {
  const existingDevice = devices.some((device) => device.deviceId === nextDevice.deviceId);

  if (!existingDevice) {
    return [...devices, nextDevice];
  }

  return devices.map((device) => (device.deviceId === nextDevice.deviceId ? nextDevice : device));
}

function isTelemetryFrame(message: DeviceMessage): boolean {
  return message.type === "imu" || message.type === "orientation";
}

function calculateTelemetryRate(frameTimes: number[], timestamp: number): number {
  const cutoff = timestamp - RATE_WINDOW_MS;
  while (frameTimes[0] !== undefined && frameTimes[0] < cutoff) {
    frameTimes.shift();
  }

  return frameTimes.length / (RATE_WINDOW_MS / 1_000);
}

function cloneUsbState(state: UsbTestSessionState): UsbTestSessionState {
  return {
    ...state,
    rawLines: state.rawLines.map((line) => ({ ...line })),
    frameCounters: { ...state.frameCounters },
    devices: structuredClone(state.devices),
  };
}

export function isDeviceFrameType(frameType: UsbRawFrameType): frameType is DeviceMessageType {
  return DEVICE_MESSAGE_TYPES.includes(frameType as DeviceMessageType);
}
