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

export type SerialSetupEvent =
  | { type: "configureResult"; result: ConfigureResult }
  | { type: "line"; line: string }
  | { type: "error"; message: string };

type SerialEventListener = (event: SerialSetupEvent) => void;

interface SerialLike {
  requestPort: () => Promise<SerialPortLike>;
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
}

export const DEFAULT_SERIAL_BAUD_RATE = 115_200;

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

  get connected(): boolean {
    return Boolean(this.#port);
  }

  subscribe(listener: SerialEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.#port) {
      return;
    }

    const serial = getSerialApi();
    const port = await serial.requestPort();
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

  async sendConfigure(request: ConfigureRequest): Promise<void> {
    if (!this.#writer) {
      throw new Error("Serial port is not connected.");
    }

    await this.#writer.write(new TextEncoder().encode(serializeConfigureRequest(request)));
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

function getSerialApi(): SerialLike {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial is not supported in this browser.");
  }

  return (navigator as Navigator & { serial: SerialLike }).serial;
}
