import { describe, expect, it } from "vitest";
import { DeviceRegistry, SAFE_MODE_TIMEOUT_MS } from "./device-state";
import type { OrientationMessage } from "./protocol";

const baseOrientation: OrientationMessage = {
  type: "orientation",
  deviceId: "m5stick-plus2-001",
  role: "controller",
  seq: 1,
  timeMs: 1000,
  pitch: 1,
  roll: 2,
  yaw: 3,
  quality: 1,
};

describe("device state", () => {
  it("updates orientation telemetry and clears safe mode for fresh telemetry", () => {
    const registry = new DeviceRegistry();
    const update = registry.upsertFromMessage(baseOrientation, 10_000);

    expect(update.snapshot.safeMode).toBe(false);
    expect(update.snapshot.orientation).toEqual({ pitch: 1, roll: 2, yaw: 3 });
    expect(update.snapshot.lastTelemetryAt).toBe(10_000);
  });

  it("estimates packet loss from sequence gaps", () => {
    const registry = new DeviceRegistry();

    registry.upsertFromMessage(baseOrientation, 10_000);
    const update = registry.upsertFromMessage({ ...baseOrientation, seq: 4, yaw: 4 }, 10_020);

    expect(update.sequenceGap).toBe(2);
    expect(update.snapshot.lostMessages).toBe(2);
    expect(update.snapshot.receivedMessages).toBe(2);
    expect(update.snapshot.packetLossEstimate).toBeCloseTo(0.5);
  });

  it("tracks stale telemetry and sets safe mode after more than three seconds", () => {
    const registry = new DeviceRegistry();

    registry.upsertFromMessage(baseOrientation, 10_000);
    const freshSnapshot = registry.getSnapshot("m5stick-plus2-001", 10_000 + SAFE_MODE_TIMEOUT_MS);
    const staleSnapshot = registry.getSnapshot("m5stick-plus2-001", 10_001 + SAFE_MODE_TIMEOUT_MS);

    expect(freshSnapshot?.safeMode).toBe(false);
    expect(staleSnapshot?.safeMode).toBe(true);
  });

  it("rejects repeated sequence numbers without advancing counters", () => {
    const registry = new DeviceRegistry();

    registry.upsertFromMessage(baseOrientation, 10_000);
    const update = registry.upsertFromMessage({ ...baseOrientation, yaw: 4 }, 10_020);

    expect(update.sequenceAccepted).toBe(false);
    expect(update.snapshot.invalidSequenceCount).toBe(1);
    expect(update.snapshot.receivedMessages).toBe(1);
    expect(update.snapshot.lastSeq).toBe(1);
  });
});
