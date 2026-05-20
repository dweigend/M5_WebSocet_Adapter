import { describe, expect, it } from "vitest";
import {
  createConfigureRequest,
  formatSerialTestResult,
  M5_SERIAL_PORT_FILTERS,
  parseConfigureResult,
  type SerialLike,
  type SerialPortLike,
  selectM5SerialPort,
  serializeCommandRequest,
  serializeConfigureRequest,
} from "./serial-setup";

function createSerialPort(usbVendorId?: number, usbProductId?: number): SerialPortLike {
  return {
    readable: null,
    writable: null,
    open: async () => undefined,
    close: async () => undefined,
    getInfo: () => ({ usbVendorId, usbProductId }),
  };
}

describe("serial setup", () => {
  it("serializes exactly one newline-delimited configure message", () => {
    const request = createConfigureRequest({
      ssid: " Lab WiFi ",
      password: "secret",
      serverUrl: " ws://localhost:8787/ws/device ",
      deviceId: " m5stick-plus2-001 ",
    });

    const serialized = serializeConfigureRequest(request);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.split("\n")).toHaveLength(2);
    expect(JSON.parse(serialized)).toEqual({
      type: "configure",
      ssid: "Lab WiFi",
      password: "secret",
      serverUrl: "ws://localhost:8787/ws/device",
      deviceId: "m5stick-plus2-001",
    });
  });

  it("parses configureResult responses", () => {
    expect(parseConfigureResult('{"type":"configureResult","ok":true,"message":"saved"}')).toEqual({
      type: "configureResult",
      ok: true,
      message: "saved",
    });
  });

  it("ignores unrelated serial lines", () => {
    expect(parseConfigureResult("ready")).toBeUndefined();
  });

  it("formats USB serial test results", () => {
    expect(
      formatSerialTestResult({
        baudRate: 115_200,
        readable: true,
        writable: true,
        usbVendorId: 0x1a86,
        usbProductId: 0x55d4,
      }),
    ).toBe("USB serial opened at 115200 baud. Readable: yes. Writable: yes. USB 1a86:55d4.");
  });

  it("serializes device commands as newline-delimited JSON", () => {
    expect(serializeCommandRequest("identify")).toBe('{"type":"identify"}\n');
  });

  it("uses an already granted M5 serial port before opening the chooser", async () => {
    const grantedPort = createSerialPort(0x1a86, 0x55d4);
    const serial: SerialLike = {
      getPorts: async () => [createSerialPort(0x1209, 0x0001), grantedPort],
      requestPort: async () => {
        throw new Error("requestPort should not be called");
      },
    };

    await expect(selectM5SerialPort(serial)).resolves.toBe(grantedPort);
  });

  it("falls back to requestPort with M5 filters when no granted port matches", async () => {
    const chooserPort = createSerialPort(0x1a86, 0x55d4);
    let requestFilters: unknown;
    const serial: SerialLike = {
      getPorts: async () => [createSerialPort(0x1209, 0x0001)],
      requestPort: async (options) => {
        requestFilters = options?.filters;
        return chooserPort;
      },
    };

    await expect(selectM5SerialPort(serial)).resolves.toBe(chooserPort);
    expect(requestFilters).toEqual(M5_SERIAL_PORT_FILTERS);
  });
});
