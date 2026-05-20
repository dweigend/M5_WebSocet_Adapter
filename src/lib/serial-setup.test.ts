import { describe, expect, it } from "vitest";
import {
  createConfigureRequest,
  formatSerialTestResult,
  parseConfigureResult,
  serializeConfigureRequest,
} from "./serial-setup";

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
});
