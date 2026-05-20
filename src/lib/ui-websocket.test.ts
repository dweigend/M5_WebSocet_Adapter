import { describe, expect, it } from "vitest";
import { createUiCommand, createUiWebSocketUrl, parseUiServerMessage } from "./ui-websocket";

describe("UI WebSocket helpers", () => {
  it("builds a local hub URL from the browser location", () => {
    const location = new URL("http://localhost:5173") as unknown as Location;

    expect(createUiWebSocketUrl(location)).toBe("ws://localhost:8787/ws/ui");
  });

  it("creates targeted command messages", () => {
    expect(createUiCommand("calibrate", "m5stick-plus2-001")).toEqual({
      type: "calibrate",
      deviceId: "m5stick-plus2-001",
    });
  });

  it("parses snapshot messages", () => {
    expect(parseUiServerMessage('{"type":"snapshot","devices":[]}')).toEqual({
      type: "snapshot",
      devices: [],
    });
  });

  it("rejects unknown UI server messages", () => {
    expect(parseUiServerMessage('{"type":"unknown"}')).toBeUndefined();
  });
});
