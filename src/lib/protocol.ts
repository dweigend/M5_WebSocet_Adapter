export const DEVICE_MESSAGE_TYPES = ["register", "heartbeat", "imu", "orientation"] as const;
export const DEVICE_COMMAND_TYPES = ["calibrate", "pause", "resume", "identify", "reboot"] as const;

const MAX_QUALITY = 1;
const MIN_QUALITY = 0;

export type DeviceMessageType = (typeof DEVICE_MESSAGE_TYPES)[number];
export type DeviceCommandType = (typeof DEVICE_COMMAND_TYPES)[number];

export type DeviceRole = "controller";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BaseDeviceMessage {
  type: DeviceMessageType;
  deviceId: string;
  role: DeviceRole;
  seq: number;
  timeMs: number;
  quality: number;
}

export interface RegisterMessage extends BaseDeviceMessage {
  type: "register";
  firmwareVersion: string;
  capabilities: string[];
}

export interface HeartbeatMessage extends BaseDeviceMessage {
  type: "heartbeat";
  rssi: number;
  freeHeap: number;
  batteryVoltage: number;
  uptimeMs: number;
  calibrated: boolean;
  streaming: boolean;
}

export interface ImuMessage extends BaseDeviceMessage {
  type: "imu";
  accel: Vector3;
  gyro: Vector3;
}

export interface OrientationMessage extends BaseDeviceMessage {
  type: "orientation";
  pitch: number;
  roll: number;
  yaw: number;
}

export type DeviceMessage = RegisterMessage | HeartbeatMessage | ImuMessage | OrientationMessage;

export interface UiCommandMessage {
  type: DeviceCommandType;
  deviceId: string;
}

export type UiInboundMessage = UiCommandMessage;

export interface ProtocolError {
  code: "invalid_json" | "invalid_shape" | "unknown_type";
  message: string;
}

export type ValidationResult<T> =
  | {
      ok: true;
      message: T;
    }
  | {
      ok: false;
      error: ProtocolError;
    };

export function parseDeviceMessage(
  rawMessage: string | ArrayBuffer | Uint8Array,
): ValidationResult<DeviceMessage> {
  const parsed = parseJsonRecord(rawMessage);

  if (!parsed.ok) {
    return parsed;
  }

  return validateDeviceMessage(parsed.message);
}

export function parseUiMessage(
  rawMessage: string | ArrayBuffer | Uint8Array,
): ValidationResult<UiInboundMessage> {
  const parsed = parseJsonRecord(rawMessage);

  if (!parsed.ok) {
    return parsed;
  }

  return validateUiMessage(parsed.message);
}

export function validateDeviceMessage(
  candidate: Record<string, unknown>,
): ValidationResult<DeviceMessage> {
  if (!isString(candidate.type)) {
    return invalidShape("Message type must be a string.");
  }

  if (!isDeviceMessageType(candidate.type)) {
    return { ok: false, error: { code: "unknown_type", message: "Unknown device message type." } };
  }

  const baseError = validateBaseDeviceMessage(candidate);
  if (baseError) {
    return invalidShape(baseError);
  }

  switch (candidate.type) {
    case "register":
      return validateRegisterMessage(candidate);
    case "heartbeat":
      return validateHeartbeatMessage(candidate);
    case "imu":
      return validateImuMessage(candidate);
    case "orientation":
      return validateOrientationMessage(candidate);
  }
}

export function validateUiMessage(
  candidate: Record<string, unknown>,
): ValidationResult<UiInboundMessage> {
  if (!isString(candidate.type)) {
    return invalidShape("Command type must be a string.");
  }

  if (!isDeviceCommandType(candidate.type)) {
    return { ok: false, error: { code: "unknown_type", message: "Unknown UI command type." } };
  }

  if (!isNonEmptyString(candidate.deviceId)) {
    return invalidShape("Command deviceId must be a non-empty string.");
  }

  return {
    ok: true,
    message: {
      type: candidate.type,
      deviceId: candidate.deviceId,
    },
  };
}

function parseJsonRecord(
  rawMessage: string | ArrayBuffer | Uint8Array,
): ValidationResult<Record<string, unknown>> {
  const text = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);

  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) {
      return invalidShape("Message must be a JSON object.");
    }

    return { ok: true, message: parsed };
  } catch {
    return { ok: false, error: { code: "invalid_json", message: "Message is not valid JSON." } };
  }
}

function validateBaseDeviceMessage(candidate: Record<string, unknown>): string | undefined {
  if (!isNonEmptyString(candidate.deviceId)) {
    return "deviceId must be a non-empty string.";
  }

  if (candidate.role !== "controller") {
    return "role must be controller.";
  }

  if (!isPositiveInteger(candidate.seq)) {
    return "seq must be a positive integer.";
  }

  if (!isFiniteNonNegativeNumber(candidate.timeMs)) {
    return "timeMs must be a non-negative number.";
  }

  if (!isNumberInRange(candidate.quality, MIN_QUALITY, MAX_QUALITY)) {
    return "quality must be between 0 and 1.";
  }

  return undefined;
}

function validateRegisterMessage(
  candidate: Record<string, unknown>,
): ValidationResult<RegisterMessage> {
  if (!isNonEmptyString(candidate.firmwareVersion)) {
    return invalidShape("firmwareVersion must be a non-empty string.");
  }

  if (!Array.isArray(candidate.capabilities) || !candidate.capabilities.every(isNonEmptyString)) {
    return invalidShape("capabilities must be a string array.");
  }

  return { ok: true, message: candidate as unknown as RegisterMessage };
}

function validateHeartbeatMessage(
  candidate: Record<string, unknown>,
): ValidationResult<HeartbeatMessage> {
  if (!isFiniteNumber(candidate.rssi)) {
    return invalidShape("rssi must be a number.");
  }

  if (!isFiniteNonNegativeNumber(candidate.freeHeap)) {
    return invalidShape("freeHeap must be a non-negative number.");
  }

  if (!isFiniteNonNegativeNumber(candidate.batteryVoltage)) {
    return invalidShape("batteryVoltage must be a non-negative number.");
  }

  if (!isFiniteNonNegativeNumber(candidate.uptimeMs)) {
    return invalidShape("uptimeMs must be a non-negative number.");
  }

  if (typeof candidate.calibrated !== "boolean" || typeof candidate.streaming !== "boolean") {
    return invalidShape("calibrated and streaming must be booleans.");
  }

  return { ok: true, message: candidate as unknown as HeartbeatMessage };
}

function validateImuMessage(candidate: Record<string, unknown>): ValidationResult<ImuMessage> {
  if (!isVector3(candidate.accel)) {
    return invalidShape("accel must contain numeric x, y, and z values.");
  }

  if (!isVector3(candidate.gyro)) {
    return invalidShape("gyro must contain numeric x, y, and z values.");
  }

  return { ok: true, message: candidate as unknown as ImuMessage };
}

function validateOrientationMessage(
  candidate: Record<string, unknown>,
): ValidationResult<OrientationMessage> {
  if (
    !isFiniteNumber(candidate.pitch) ||
    !isFiniteNumber(candidate.roll) ||
    !isFiniteNumber(candidate.yaw)
  ) {
    return invalidShape("pitch, roll, and yaw must be numbers.");
  }

  return { ok: true, message: candidate as unknown as OrientationMessage };
}

function invalidShape<T>(message: string): ValidationResult<T> {
  return { ok: false, error: { code: "invalid_shape", message } };
}

function isDeviceMessageType(value: string): value is DeviceMessageType {
  return DEVICE_MESSAGE_TYPES.includes(value as DeviceMessageType);
}

function isDeviceCommandType(value: string): value is DeviceCommandType {
  return DEVICE_COMMAND_TYPES.includes(value as DeviceCommandType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isVector3(value: unknown): value is Vector3 {
  return (
    isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z)
  );
}
