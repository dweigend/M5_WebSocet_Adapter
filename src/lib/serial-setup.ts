import type { DeviceCommandType } from "./protocol";

const M5_SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 },
  { usbVendorId: 0x1a86, usbProductId: 0x7523 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x10c4 },
];

export interface ConfigureRequest {
  type: "configure";
  ssid: string;
  password: string;
  serverUrl: string;
  deviceId: string;
}

export interface ConfigureResult {
  type: "configureResult";
  ok: boolean;
  message: string;
}

export interface SerialTestResult {
  baudRate: number;
  readable: boolean;
  writable: boolean;
  usbVendorId?: number;
  usbProductId?: number;
  signals?: SerialPortSignalsLike;
}

type SerialSetupEvent =
  | { type: "configureResult"; result: ConfigureResult }
  | { type: "line"; line: string }
  | { type: "error"; message: string };

type SerialEventListener = (event: SerialSetupEvent) => void;

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortSignalsLike {
  clearToSend?: boolean;
  dataCarrierDetect?: boolean;
  dataSetReady?: boolean;
  ringIndicator?: boolean;
}

interface SerialLike {
  getPorts: () => Promise<SerialPortLike[]>;
  requestPort: (options?: { filters?: SerialPortFilterLike[] }) => Promise<SerialPortLike>;
}

interface SerialPortFilterLike {
  usbVendorId: number;
  usbProductId?: number;
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo?: () => SerialPortInfoLike;
  getSignals?: () => Promise<SerialPortSignalsLike>;
}

const DEFAULT_SERIAL_BAUD_RATE = 115_200;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function createConfigureRequest(input: {
  ssid: string;
  password: string;
  serverUrl: string;
  deviceId: string;
}): ConfigureRequest {
  return {
    type: "configure",
    ssid: input.ssid.trim(),
    password: input.password,
    serverUrl: input.serverUrl.trim(),
    deviceId: input.deviceId.trim(),
  };
}

export function serializeConfigureRequest(request: ConfigureRequest): string {
  return `${JSON.stringify(request)}\n`;
}

export function parseConfigureResult(line: string): ConfigureResult | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<ConfigureResult>;

    if (
      parsed.type !== "configureResult" ||
      typeof parsed.ok !== "boolean" ||
      typeof parsed.message !== "string"
    ) {
      return undefined;
    }

    return {
      type: "configureResult",
      ok: parsed.ok,
      message: parsed.message,
    };
  } catch {
    return undefined;
  }
}

export function formatSerialTestResult(result: SerialTestResult): string {
  const usbInfo =
    result.usbVendorId !== undefined && result.usbProductId !== undefined
      ? ` USB ${result.usbVendorId.toString(16)}:${result.usbProductId.toString(16)}.`
      : "";

  return `USB serial opened at ${result.baudRate} baud. Readable: ${
    result.readable ? "yes" : "no"
  }. Writable: ${result.writable ? "yes" : "no"}.${usbInfo}`;
}

export class SerialSetupConnection {
  readonly #baudRate: number;
  readonly #listeners = new Set<SerialEventListener>();
  #port: SerialPortLike | undefined;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  #readLoopAbort = new AbortController();

  constructor(baudRate = DEFAULT_SERIAL_BAUD_RATE) {
    this.#baudRate = baudRate;
  }

  subscribe(listener: SerialEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.#port) {
      return;
    }

    const port = await findM5SerialPort();
    await port.open({ baudRate: this.#baudRate });

    if (!port.readable || !port.writable) {
      await port.close();
      throw new Error("Serial port is not readable and writable.");
    }

    this.#port = port;
    this.#reader = port.readable.getReader();
    this.#writer = port.writable.getWriter();
    this.#readLoopAbort = new AbortController();
    void this.#readLines(this.#readLoopAbort.signal);
  }

  static async testConnection(baudRate = DEFAULT_SERIAL_BAUD_RATE): Promise<SerialTestResult> {
    const port = await findM5SerialPort();

    try {
      await port.open({ baudRate });

      return {
        baudRate,
        readable: Boolean(port.readable),
        writable: Boolean(port.writable),
        ...port.getInfo?.(),
        signals: await port.getSignals?.(),
      };
    } finally {
      await port.close();
    }
  }

  // fallow-ignore-next-line unused-class-member
  async sendConfigure(request: ConfigureRequest): Promise<void> {
    if (!this.#writer) {
      throw new Error("Serial port is not connected.");
    }

    await this.#writer.write(new TextEncoder().encode(serializeConfigureRequest(request)));
  }

  async sendCommand(type: DeviceCommandType): Promise<void> {
    if (!this.#writer) {
      throw new Error("Serial port is not connected.");
    }

    await this.#writer.write(new TextEncoder().encode(`${JSON.stringify({ type })}\n`));
  }

  async disconnect(): Promise<void> {
    this.#readLoopAbort.abort();

    if (this.#reader) {
      try {
        await this.#reader.cancel();
      } catch {
        // The port may already be closed by the browser or device.
      }
      this.#reader.releaseLock();
      this.#reader = undefined;
    }

    if (this.#writer) {
      try {
        await this.#writer.close();
      } catch {
        // Some browsers reject close after unplugging the device.
      }
      this.#writer.releaseLock();
      this.#writer = undefined;
    }

    if (this.#port) {
      try {
        await this.#port.close();
      } catch {
        // Closing a physically disconnected port can throw.
      }
      this.#port = undefined;
    }
  }

  async #readLines(signal: AbortSignal): Promise<void> {
    if (!this.#reader) {
      return;
    }

    const decoder = new TextDecoder();
    let bufferedText = "";

    try {
      while (!signal.aborted) {
        const { value, done } = await this.#reader.read();

        if (done) {
          break;
        }

        bufferedText += decoder.decode(value, { stream: true });
        const lines = bufferedText.split("\n");
        bufferedText = lines.pop() ?? "";

        for (const line of lines) {
          this.#handleLine(line.trim());
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        this.#emit({
          type: "error",
          message: error instanceof Error ? error.message : "Serial read failed.",
        });
      }
    }
  }

  #handleLine(line: string): void {
    if (!line) {
      return;
    }

    const configureResult = parseConfigureResult(line);
    if (configureResult) {
      this.#emit({ type: "configureResult", result: configureResult });
      return;
    }

    this.#emit({ type: "line", line });
  }

  #emit(event: SerialSetupEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

async function findM5SerialPort(): Promise<SerialPortLike> {
  const serial = getSerialApi();
  const grantedPorts = await serial.getPorts();
  const matchingGrantedPort = grantedPorts.find(isLikelyM5SerialPort);

  if (matchingGrantedPort) {
    return matchingGrantedPort;
  }

  return serial.requestPort({ filters: M5_SERIAL_FILTERS });
}

function isLikelyM5SerialPort(port: SerialPortLike): boolean {
  const info = port.getInfo?.();

  if (!info?.usbVendorId) {
    return false;
  }

  return M5_SERIAL_FILTERS.some((filter) => {
    if (filter.usbVendorId !== info.usbVendorId) {
      return false;
    }

    return filter.usbProductId === undefined || filter.usbProductId === info.usbProductId;
  });
}

function getSerialApi(): SerialLike {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial is not supported in this browser.");
  }

  return (navigator as Navigator & { serial: SerialLike }).serial;
}
