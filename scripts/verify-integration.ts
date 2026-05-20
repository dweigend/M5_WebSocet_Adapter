import { type RunningHub, startHub } from "../src/server/hub";

const TEST_TIMEOUT_MS = 2_000;

const hub = startHub({ port: 0, hostname: "127.0.0.1" });

try {
  const uiSocket = await openSocket(getHubWebSocketUrl(hub, "/ws/ui"));
  const deviceSocket = await openSocket(getHubWebSocketUrl(hub, "/ws/device"));

  const telemetryUpdate = waitForMessage(
    uiSocket,
    (message) => message.type === "deviceUpdate" && getDeviceId(message) === "m5stick-plus2-sim",
  );

  deviceSocket.send(
    JSON.stringify({
      type: "orientation",
      deviceId: "m5stick-plus2-sim",
      role: "controller",
      seq: 1,
      timeMs: 20,
      pitch: 1.2,
      roll: -2.4,
      yaw: 0.3,
      quality: 1,
    }),
  );

  await telemetryUpdate;

  const forwardedCommand = waitForMessage(deviceSocket, (message) => message.type === "identify");
  uiSocket.send(JSON.stringify({ type: "identify", deviceId: "m5stick-plus2-sim" }));
  await forwardedCommand;

  const replacementDeviceSocket = await openSocket(getHubWebSocketUrl(hub, "/ws/device"));
  const replacementUpdate = waitForMessage(
    uiSocket,
    (message) => message.type === "deviceUpdate" && getDeviceId(message) === "m5stick-plus2-sim",
  );

  replacementDeviceSocket.send(
    JSON.stringify({
      type: "orientation",
      deviceId: "m5stick-plus2-sim",
      role: "controller",
      seq: 2,
      timeMs: 40,
      pitch: 2.1,
      roll: -1.4,
      yaw: 0.7,
      quality: 1,
    }),
  );

  await replacementUpdate;
  deviceSocket.close();

  const replacementCommand = waitForMessage(
    replacementDeviceSocket,
    (message) => message.type === "identify",
  );
  uiSocket.send(JSON.stringify({ type: "identify", deviceId: "m5stick-plus2-sim" }));
  await replacementCommand;

  uiSocket.close();
  replacementDeviceSocket.close();
  console.info(
    "Integration verification passed: telemetry broadcast, command forwarding, and reconnect handoff work.",
  );
} finally {
  hub.stop();
}

function getHubWebSocketUrl(runningHub: RunningHub, path: string): string {
  const url = new URL(path, runningHub.server.url);
  url.protocol = "ws:";
  return url.toString();
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out opening ${url}`)),
      TEST_TIMEOUT_MS,
    );

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error(`Could not open ${url}`));
      },
      { once: true },
    );
  });

  return socket;
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message."));
    }, TEST_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") {
        return;
      }

      const parsed = JSON.parse(event.data) as Record<string, unknown>;
      if (!predicate(parsed)) {
        return;
      }

      cleanup();
      resolve(parsed);
    };

    const onError = () => {
      cleanup();
      reject(new Error("WebSocket emitted an error."));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function getDeviceId(message: Record<string, unknown>): string | undefined {
  const device = message.device;

  if (!device || typeof device !== "object" || !("deviceId" in device)) {
    return undefined;
  }

  return typeof device.deviceId === "string" ? device.deviceId : undefined;
}
