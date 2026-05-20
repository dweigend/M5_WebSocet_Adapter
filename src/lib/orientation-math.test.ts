import { Vector3 } from "three";
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

  it("maps a level sensor to a flat display-up model pose", () => {
    const quaternion = createSensorOrientationQuaternion({ pitch: 0, roll: 0, yaw: 720 });
    const displayNormal = new Vector3(0, 0, 1).applyQuaternion(quaternion);

    expect(displayNormal.x).toBeCloseTo(0);
    expect(displayNormal.y).toBeCloseTo(1);
    expect(displayNormal.z).toBeCloseTo(0);
  });

  it("keeps yaw rotation around the flat display-up axis", () => {
    const quaternion = createSensorOrientationQuaternion({ pitch: 0, roll: 0, yaw: 90 });
    const displayNormal = new Vector3(0, 0, 1).applyQuaternion(quaternion);

    expect(displayNormal.x).toBeCloseTo(0);
    expect(displayNormal.y).toBeCloseTo(1);
    expect(displayNormal.z).toBeCloseTo(0);
  });

  it("keeps smoothing alpha frame-rate independent and bounded", () => {
    expect(calculateSmoothingAlpha(0, 12)).toBe(0);
    expect(calculateSmoothingAlpha(1 / 60, 12)).toBeGreaterThan(0);
    expect(calculateSmoothingAlpha(1 / 60, 12)).toBeLessThan(1);
  });
});
