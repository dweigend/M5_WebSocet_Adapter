import { describe, expect, it } from "vitest";
import {
  createDeviceWebSocketUrl,
  createUiCommand,
  createUiWebSocketUrl,
  parseUiServerMessage,
} from "./ui-websocket";

describe("UI WebSocket helpers", () => {
  it("builds a local hub URL from the browser location", () => {
    const location = new URL("http://localhost:5173") as unknown as Location;

    expect(createUiWebSocketUrl(location)).toBe("ws://localhost:8787/ws/ui");
  });

  it("uses query and environment-style overrides for the hub URL", () => {
    const location = new URL("http://localhost:5173/?hubPort=8788") as unknown as Location;

    expect(createUiWebSocketUrl(location, { hubPort: "9999" })).toBe("ws://localhost:8788/ws/ui");
    expect(createUiWebSocketUrl(location, { hubUrl: "ws://127.0.0.1:9000" })).toBe(
      "ws://localhost:8788/ws/ui",
    );
    expect(
      createUiWebSocketUrl(new URL("https://ui.local") as unknown as Location, {
        hubPort: "9000",
      }),
    ).toBe("wss://ui.local:9000/ws/ui");
    expect(
      createUiWebSocketUrl(new URL("http://ui.local") as unknown as Location, {
        hubUrl: "ws://127.0.0.1:9000",
      }),
    ).toBe("ws://127.0.0.1:9000/ws/ui");
  });

  it("builds a controller-reachable device URL from a LAN host", () => {
    const location = new URL("http://192.168.1.10:5173/?hubPort=8789") as unknown as Location;

    expect(createDeviceWebSocketUrl(location)).toBe("ws://192.168.1.10:8789/ws/device");
  });

  it("does not prefill loopback addresses for controller setup", () => {
    const location = new URL("http://localhost:5173") as unknown as Location;

    expect(createDeviceWebSocketUrl(location)).toBe("");
    expect(createDeviceWebSocketUrl(location, { deviceHost: "127.0.0.1" })).toBe("");
    expect(createDeviceWebSocketUrl(location, { deviceHost: "192.168.1.10" })).toBe(
      "ws://192.168.1.10:8787/ws/device",
    );
  });

  it("creates targeted command messages", () => {
    expect(createUiCommand("calibrate", "m5stick-plus2-001")).toEqual({
      type: "calibrate",
      deviceId: "m5stick-plus2-001",
    });
  });

  it("parses snapshot messages", () => {
    expect(
      parseUiServerMessage(
        JSON.stringify({
          type: "snapshot",
          devices: [
            {
              deviceId: "m5stick-plus2-001",
              connected: true,
              safeMode: false,
              lastMessageAt: 1,
              lastTelemetryAt: 1,
              lastHeartbeatAt: null,
              heartbeatAgeMs: null,
              telemetryAgeMs: 0,
              lastSeq: 1,
              expectedSeq: 2,
              receivedMessages: 1,
              lostMessages: 0,
              packetLossEstimate: 0,
              invalidSequenceCount: 0,
              capabilities: ["orientation"],
            },
          ],
        }),
      ),
    ).toEqual({
      type: "snapshot",
      devices: [
        {
          deviceId: "m5stick-plus2-001",
          connected: true,
          safeMode: false,
          lastMessageAt: 1,
          lastTelemetryAt: 1,
          lastHeartbeatAt: null,
          heartbeatAgeMs: null,
          telemetryAgeMs: 0,
          lastSeq: 1,
          expectedSeq: 2,
          receivedMessages: 1,
          lostMessages: 0,
          packetLossEstimate: 0,
          invalidSequenceCount: 0,
          capabilities: ["orientation"],
        },
      ],
    });
  });

  it("rejects malformed UI server payloads", () => {
    expect(parseUiServerMessage('{"type":"snapshot","devices":[{}]}')).toBeUndefined();
    expect(parseUiServerMessage('{"type":"deviceStatus","device":{}}')).toBeUndefined();
    expect(parseUiServerMessage('{"type":"error","error":{"code":"bad","message":"Nope"}}')).toBe(
      undefined,
    );
  });

  it("rejects unknown UI server messages", () => {
    expect(parseUiServerMessage('{"type":"unknown"}')).toBeUndefined();
  });
});
