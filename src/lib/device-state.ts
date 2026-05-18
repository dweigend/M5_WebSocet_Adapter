import type {
  DeviceMessage,
  HeartbeatMessage,
  ImuMessage,
  OrientationMessage,
  RegisterMessage,
} from "./protocol";

export const SAFE_MODE_TIMEOUT_MS = 3_000;

export interface DeviceSnapshot {
  deviceId: string;
  connected: boolean;
  safeMode: boolean;
  lastMessageAt: number;
  lastTelemetryAt: number | null;
  lastHeartbeatAt: number | null;
  heartbeatAgeMs: number | null;
  telemetryAgeMs: number | null;
  lastSeq: number;
  expectedSeq: number;
  receivedMessages: number;
  lostMessages: number;
  packetLossEstimate: number;
  invalidSequenceCount: number;
  firmwareVersion?: string;
  capabilities: string[];
  heartbeat?: Omit<HeartbeatMessage, "type" | "deviceId" | "role" | "seq" | "timeMs" | "quality">;
  imu?: Omit<ImuMessage, "type" | "deviceId" | "role" | "seq" | "timeMs" | "quality">;
  orientation?: Omit<
    OrientationMessage,
    "type" | "deviceId" | "role" | "seq" | "timeMs" | "quality"
  >;
}

export interface DeviceUpdate {
  snapshot: DeviceSnapshot;
  sequenceGap: number;
  sequenceAccepted: boolean;
}

export class DeviceRegistry {
  readonly #devices = new Map<string, DeviceSnapshot>();

  upsertFromMessage(message: DeviceMessage, receivedAt: number): DeviceUpdate {
    const existing = this.#devices.get(message.deviceId);
    const snapshot = existing ?? createDeviceSnapshot(message.deviceId, receivedAt);
    const { sequenceGap, sequenceAccepted } = applySequence(snapshot, message.seq);

    snapshot.connected = true;
    snapshot.lastMessageAt = receivedAt;

    if (isTelemetryMessage(message)) {
      snapshot.lastTelemetryAt = receivedAt;
    }

    if (message.type === "heartbeat") {
      snapshot.lastHeartbeatAt = receivedAt;
      snapshot.heartbeat = {
        rssi: message.rssi,
        freeHeap: message.freeHeap,
        batteryVoltage: message.batteryVoltage,
        uptimeMs: message.uptimeMs,
        calibrated: message.calibrated,
        streaming: message.streaming,
      };
    }

    if (message.type === "register") {
      applyRegister(snapshot, message);
    }

    if (message.type === "imu") {
      snapshot.imu = { accel: message.accel, gyro: message.gyro };
    }

    if (message.type === "orientation") {
      snapshot.orientation = {
        pitch: message.pitch,
        roll: message.roll,
        yaw: message.yaw,
      };
    }

    updateDerivedStatus(snapshot, receivedAt);
    this.#devices.set(message.deviceId, snapshot);

    return {
      snapshot: structuredClone(snapshot),
      sequenceGap,
      sequenceAccepted,
    };
  }

  markDisconnected(deviceId: string, timestamp: number): DeviceSnapshot | undefined {
    const snapshot = this.#devices.get(deviceId);
    if (!snapshot) {
      return undefined;
    }

    snapshot.connected = false;
    updateDerivedStatus(snapshot, timestamp);
    return structuredClone(snapshot);
  }

  refreshStaleStatus(timestamp: number): DeviceSnapshot[] {
    const changed: DeviceSnapshot[] = [];

    for (const snapshot of this.#devices.values()) {
      const previousSafeMode = snapshot.safeMode;
      updateDerivedStatus(snapshot, timestamp);

      if (snapshot.safeMode !== previousSafeMode) {
        changed.push(structuredClone(snapshot));
      }
    }

    return changed;
  }

  getSnapshot(deviceId: string, timestamp = Date.now()): DeviceSnapshot | undefined {
    const snapshot = this.#devices.get(deviceId);
    if (!snapshot) {
      return undefined;
    }

    updateDerivedStatus(snapshot, timestamp);
    return structuredClone(snapshot);
  }

  getAllSnapshots(timestamp = Date.now()): DeviceSnapshot[] {
    return Array.from(this.#devices.values(), (snapshot) => {
      updateDerivedStatus(snapshot, timestamp);
      return structuredClone(snapshot);
    });
  }
}

function createDeviceSnapshot(deviceId: string, timestamp: number): DeviceSnapshot {
  return {
    deviceId,
    connected: true,
    safeMode: true,
    lastMessageAt: timestamp,
    lastTelemetryAt: null,
    lastHeartbeatAt: null,
    heartbeatAgeMs: null,
    telemetryAgeMs: null,
    lastSeq: 0,
    expectedSeq: 1,
    receivedMessages: 0,
    lostMessages: 0,
    packetLossEstimate: 0,
    invalidSequenceCount: 0,
    capabilities: [],
  };
}

function applySequence(
  snapshot: DeviceSnapshot,
  seq: number,
): Pick<DeviceUpdate, "sequenceAccepted" | "sequenceGap"> {
  if (seq < snapshot.expectedSeq) {
    snapshot.invalidSequenceCount += 1;
    return { sequenceAccepted: false, sequenceGap: 0 };
  }

  const sequenceGap = Math.max(0, seq - snapshot.expectedSeq);
  snapshot.receivedMessages += 1;
  snapshot.lostMessages += sequenceGap;
  snapshot.lastSeq = seq;
  snapshot.expectedSeq = seq + 1;
  snapshot.packetLossEstimate =
    snapshot.lostMessages / Math.max(1, snapshot.receivedMessages + snapshot.lostMessages);

  return { sequenceAccepted: true, sequenceGap };
}

function applyRegister(snapshot: DeviceSnapshot, message: RegisterMessage): void {
  snapshot.firmwareVersion = message.firmwareVersion;
  snapshot.capabilities = [...message.capabilities];
}

function updateDerivedStatus(snapshot: DeviceSnapshot, timestamp: number): void {
  snapshot.heartbeatAgeMs =
    snapshot.lastHeartbeatAt === null ? null : timestamp - snapshot.lastHeartbeatAt;
  snapshot.telemetryAgeMs =
    snapshot.lastTelemetryAt === null ? null : timestamp - snapshot.lastTelemetryAt;
  snapshot.safeMode =
    !snapshot.connected ||
    snapshot.lastTelemetryAt === null ||
    timestamp - snapshot.lastTelemetryAt > SAFE_MODE_TIMEOUT_MS;
}

function isTelemetryMessage(message: DeviceMessage): message is ImuMessage | OrientationMessage {
  return message.type === "imu" || message.type === "orientation";
}
