import { Euler, MathUtils, Quaternion } from "three";

export interface SensorOrientation {
  pitch: number;
  roll: number;
  yaw: number;
}

export const SENSOR_ORIENTATION_EULER_ORDER = "YXZ";

export function normalizeDegrees(degrees: number): number {
  return MathUtils.euclideanModulo(degrees + 180, 360) - 180;
}

export function createSensorOrientationQuaternion(orientation: SensorOrientation): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(orientation.pitch),
      MathUtils.degToRad(normalizeDegrees(orientation.yaw)),
      MathUtils.degToRad(orientation.roll),
      SENSOR_ORIENTATION_EULER_ORDER,
    ),
  );
}

export function calculateSmoothingAlpha(deltaSeconds: number, smoothingSpeed: number): number {
  return 1 - Math.exp(-smoothingSpeed * deltaSeconds);
}
