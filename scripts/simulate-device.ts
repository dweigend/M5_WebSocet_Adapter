const serverUrl = process.env.DEVICE_WS_URL ?? "ws://localhost:8787/ws/device";
const deviceId = process.env.DEVICE_ID ?? "m5stick-plus2-sim";
const messageRate = readPositiveNumberEnv("MESSAGE_RATE", 50);
const durationMs = readPositiveNumberEnv("DURATION_MS", 2_000);
const intervalMs = 1_000 / messageRate;

let seq = 1;
let sentMessages = 0;

const socket = new WebSocket(serverUrl);

socket.addEventListener("open", () => {
  send({
    type: "register",
    firmwareVersion: "simulator",
    capabilities: ["imu", "orientation"],
  });

  const startedAt = performance.now();
  const timer = setInterval(() => {
    const elapsedMs = performance.now() - startedAt;

    if (elapsedMs >= durationMs) {
      clearInterval(timer);
      socket.close();
      console.info(`Sent ${sentMessages} messages in ${Math.round(elapsedMs)}ms.`);
      return;
    }

    send({
      type: "orientation",
      pitch: Math.sin(elapsedMs / 500) * 10,
      roll: Math.cos(elapsedMs / 500) * 10,
      yaw: (elapsedMs / 20) % 360,
    });
  }, intervalMs);
});

socket.addEventListener("error", () => {
  console.error(`Could not connect to ${serverUrl}. Start the hub with bun run server first.`);
  process.exitCode = 1;
});

function send(payload: Record<string, unknown>): void {
  socket.send(
    JSON.stringify({
      ...payload,
      deviceId,
      role: "controller",
      seq,
      timeMs: Math.round(performance.now()),
      quality: 1,
    }),
  );
  seq += 1;
  sentMessages += 1;
}

function readPositiveNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}
