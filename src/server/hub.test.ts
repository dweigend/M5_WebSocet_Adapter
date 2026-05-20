import { afterEach, describe, expect, it } from "vitest";
import { type RunningHub, startHub } from "./hub";

const TEST_TIMEOUT_MS = 2_000;

let runningHub: RunningHub | undefined;

afterEach(() => {
  runningHub?.stop();
  runningHub = undefined;
});

describe.skipIf(typeof Bun === "undefined")("WebSocket hub integration", () => {
  it("broadcasts simulated device telemetry to UI clients", async () => {
    runningHub = startHub({ port: 0, hostname: "127.0.0.1" });
    const uiSocket = await openSocket(getHubWebSocketUrl(runningHub, "/ws/ui"));
    const deviceSocket = await openSocket(getHubWebSocketUrl(runningHub, "/ws/device"));

    const nextUiMessage = waitForMessage(uiSocket, (message) => message.type === "deviceUpdate");

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

    await expect(nextUiMessage).resolves.toMatchObject({
      type: "deviceUpdate",
      device: {
        deviceId: "m5stick-plus2-sim",
        safeMode: false,
        orientation: { pitch: 1.2, roll: -2.4, yaw: 0.3 },
      },
      message: { type: "orientation" },
    });

    uiSocket.close();
    deviceSocket.close();
  });

  it("forwards targeted UI commands to the connected device socket", async () => {
    runningHub = startHub({ port: 0, hostname: "127.0.0.1" });
    const deviceSocket = await openSocket(getHubWebSocketUrl(runningHub, "/ws/device"));
    const uiSocket = await openSocket(getHubWebSocketUrl(runningHub, "/ws/ui"));

    deviceSocket.send(
      JSON.stringify({
        type: "register",
        deviceId: "m5stick-plus2-sim",
        role: "controller",
        seq: 1,
        timeMs: 1,
        firmwareVersion: "simulator",
        capabilities: ["imu", "orientation"],
        quality: 1,
      }),
    );

    await waitForMessage(uiSocket, (message) => message.type === "deviceUpdate");

    const forwardedCommand = waitForMessage(deviceSocket, (message) => message.type === "identify");
    uiSocket.send(JSON.stringify({ type: "identify", deviceId: "m5stick-plus2-sim" }));

    await expect(forwardedCommand).resolves.toEqual({ type: "identify" });

    uiSocket.close();
    deviceSocket.close();
  });
});

function getHubWebSocketUrl(hub: RunningHub, path: string): string {
  const url = new URL(path, hub.server.url);
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
