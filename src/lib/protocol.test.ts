import { describe, expect, it } from "vitest";
import { parseDeviceMessage, parseUiMessage } from "./protocol";

describe("protocol validation", () => {
  it("rejects invalid JSON without throwing", () => {
    const result = parseDeviceMessage("{");

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_json", message: "Message is not valid JSON." },
    });
  });

  it("rejects unknown device message types", () => {
    const result = parseDeviceMessage(JSON.stringify({ type: "unknown" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_type");
    }
  });

  it("accepts a valid orientation message", () => {
    const result = parseDeviceMessage(
      JSON.stringify({
        type: "orientation",
        deviceId: "m5stick-plus2-001",
        role: "controller",
        seq: 4,
        timeMs: 3040,
        pitch: 1.2,
        roll: -2.4,
        yaw: 0.3,
        quality: 1,
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects UI commands without a target device", () => {
    const result = parseUiMessage(JSON.stringify({ type: "calibrate" }));

    expect(result.ok).toBe(false);
  });

  it("accepts a valid UI command", () => {
    const result = parseUiMessage(
      JSON.stringify({ type: "identify", deviceId: "m5stick-plus2-001" }),
    );

    expect(result).toEqual({
      ok: true,
      message: { type: "identify", deviceId: "m5stick-plus2-001" },
    });
  });
});
