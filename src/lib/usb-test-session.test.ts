import { describe, expect, it } from "vitest";
import {
  prependRawLine,
  RAW_SERIAL_LOG_LIMIT,
  type RawSerialEntry,
  UsbTestSession,
} from "./usb-test-session";

const orientationLine = JSON.stringify({
  type: "orientation",
  deviceId: "m5stick-plus2-usb",
  role: "controller",
  seq: 1,
  timeMs: 100,
  pitch: 1.2,
  roll: -2.4,
  yaw: 0.3,
  quality: 1,
});

const imuLine = JSON.stringify({
  type: "imu",
  deviceId: "m5stick-plus2-usb",
  role: "controller",
  seq: 2,
  timeMs: 120,
  accel: { x: 0.01, y: 0.02, z: 0.98 },
  gyro: { x: 0.1, y: 0.2, z: 0 },
  quality: 1,
});

describe("USB test session", () => {
  it("parses valid USB telemetry into device state", () => {
    const session = new UsbTestSession();

    session.ingestSerialLine(orientationLine, 10_000);

    const [device] = session.state.devices;
    expect(device?.deviceId).toBe("m5stick-plus2-usb");
    expect(device?.orientation).toEqual({ pitch: 1.2, roll: -2.4, yaw: 0.3 });
    expect(session.state.frameCounters.orientation).toBe(1);
    expect(session.state.validFrameCount).toBe(1);
  });

  it("tracks invalid raw lines and the last parse error", () => {
    const session = new UsbTestSession();

    session.ingestSerialLine("not json", 10_000);

    expect(session.state.invalidLineCount).toBe(1);
    expect(session.state.frameCounters.unsupported).toBe(1);
    expect(session.state.lastParseError).toBe("Message is not valid JSON.");
    expect(session.state.rawLines[0]).toMatchObject({
      valid: false,
      frameType: "unsupported",
      line: "not json",
    });
  });

  it("tracks configureResult and telemetry frame counters", () => {
    const session = new UsbTestSession();

    session.ingestSerialLine('{"type":"configureResult","ok":true,"message":"saved"}', 10_000);
    session.ingestSerialLine(orientationLine, 10_020);
    session.ingestSerialLine(imuLine, 10_040);

    expect(session.state.frameCounters.configureResult).toBe(1);
    expect(session.state.frameCounters.orientation).toBe(1);
    expect(session.state.frameCounters.imu).toBe(1);
    expect(session.state.validFrameCount).toBe(3);
    expect(session.state.telemetryRateHz).toBeCloseTo(0.4);
  });

  it("keeps the raw log bounded as a ring buffer", () => {
    let rawLines: RawSerialEntry[] = [];

    for (let index = 0; index < RAW_SERIAL_LOG_LIMIT + 5; index += 1) {
      rawLines = prependRawLine(rawLines, {
        id: index,
        receivedAt: index,
        line: `line-${index}`,
        valid: true,
        frameType: "unsupported",
      });
    }

    expect(rawLines).toHaveLength(RAW_SERIAL_LOG_LIMIT);
    expect(rawLines[0]?.line).toBe(`line-${RAW_SERIAL_LOG_LIMIT + 4}`);
    expect(rawLines.at(-1)?.line).toBe("line-5");
  });
});
