import { describe, expect, it } from "vitest";
import {
  createConfigureRequest,
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
});
