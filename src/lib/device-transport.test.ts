import { describe, expect, it } from "vitest";
import type { DeviceSnapshot } from "./device-state";
import { chooseCommandTransport, mergeSourceAwareDevices } from "./device-transport";

function createDevice(deviceId: string, lastMessageAt: number): DeviceSnapshot {
  return {
    deviceId,
    connected: true,
    safeMode: false,
    lastMessageAt,
    lastTelemetryAt: lastMessageAt,
    lastHeartbeatAt: null,
    heartbeatAgeMs: null,
    telemetryAgeMs: 0,
    lastSeq: 1,
    expectedSeq: 2,
    receivedMessages: 1,
    lostMessages: 0,
    packetLossEstimate: 0,
    invalidSequenceCount: 0,
    capabilities: [],
  };
}

describe("device transport", () => {
  it("marks devices with usb, hub, or both sources", () => {
    const devices = mergeSourceAwareDevices(
      [createDevice("hub-only", 100), createDevice("both", 100)],
      [createDevice("usb-only", 200), createDevice("both", 300)],
    );

    expect(devices.map((device) => [device.deviceId, device.source])).toEqual([
      ["both", "both"],
      ["hub-only", "hub"],
      ["usb-only", "usb"],
    ]);
    expect(devices.find((device) => device.deviceId === "both")?.lastMessageAt).toBe(300);
  });

  it("prefers USB command routing when the selected device has a USB source", () => {
    const [device] = mergeSourceAwareDevices(
      [createDevice("m5stick-plus2-001", 100)],
      [createDevice("m5stick-plus2-001", 200)],
    );

    expect(chooseCommandTransport({ device, usbAvailable: true, hubAvailable: true })).toBe("usb");
  });

  it("falls back to hub when USB is unavailable", () => {
    const [device] = mergeSourceAwareDevices([], [createDevice("m5stick-plus2-usb", 200)]);

    expect(chooseCommandTransport({ device, usbAvailable: false, hubAvailable: true })).toBe("hub");
  });

  it("does not route commands when no transport is available", () => {
    const [device] = mergeSourceAwareDevices([], [createDevice("m5stick-plus2-usb", 200)]);

    expect(chooseCommandTransport({ device, usbAvailable: false, hubAvailable: false })).toBe(
      undefined,
    );
  });
});
