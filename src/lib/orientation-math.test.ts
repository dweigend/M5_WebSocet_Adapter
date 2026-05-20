import { describe, expect, it } from "vitest";
import {
  calculateSmoothingAlpha,
  createSensorOrientationQuaternion,
  normalizeDegrees,
} from "./orientation-math";

describe("orientation math", () => {
  it("normalizes cumulative yaw degrees for display rotation", () => {
    expect(normalizeDegrees(821.29)).toBeCloseTo(101.29);
    expect(normalizeDegrees(-181)).toBe(179);
  });

  it("creates a stable identity quaternion for a level sensor", () => {
    const quaternion = createSensorOrientationQuaternion({ pitch: 0, roll: 0, yaw: 720 });

    expect(quaternion.x).toBeCloseTo(0);
    expect(quaternion.y).toBeCloseTo(0);
    expect(quaternion.z).toBeCloseTo(0);
    expect(quaternion.w).toBeCloseTo(1);
  });

  it("keeps smoothing alpha frame-rate independent and bounded", () => {
    expect(calculateSmoothingAlpha(0, 12)).toBe(0);
    expect(calculateSmoothingAlpha(1 / 60, 12)).toBeGreaterThan(0);
    expect(calculateSmoothingAlpha(1 / 60, 12)).toBeLessThan(1);
  });
});
