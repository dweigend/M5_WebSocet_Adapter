import { DeviceRegistry } from "../lib/device-state";
import { parseDeviceMessage, parseUiMessage, type UiCommandMessage } from "../lib/protocol";

const DEFAULT_PORT = 8787;
const STALE_SCAN_INTERVAL_MS = 250;
const UI_TOPIC = "ui-clients";

type ClientRole = "device" | "ui";

interface ClientData {
  role: ClientRole;
  deviceId?: string;
}

type HubWebSocket = Bun.ServerWebSocket<ClientData>;

export interface HubOptions {
  port?: number;
  hostname?: string;
}

export interface RunningHub {
  server: Bun.Server<ClientData>;
  registry: DeviceRegistry;
  stop: () => void;
}

export function startHub(options: HubOptions = {}): RunningHub {
  const registry = new DeviceRegistry();
  const deviceSockets = new Map<string, HubWebSocket>();
  let staleTimer: ReturnType<typeof setInterval> | undefined;

  const server = Bun.serve<ClientData>({
    port: options.port ?? Number(process.env.PORT ?? DEFAULT_PORT),
    hostname: options.hostname,
    fetch(request, bunServer) {
      const url = new URL(request.url);

      if (url.pathname === "/ws/device") {
        return upgrade(request, bunServer, { role: "device" });
      }

      if (url.pathname === "/ws/ui") {
        return upgrade(request, bunServer, { role: "ui" });
      }

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      return new Response("Not found", { status: 404 });
    },
    websocket: {
      data: {} as ClientData,
      open(ws) {
        if (ws.data.role === "ui") {
          ws.subscribe(UI_TOPIC);
          ws.send(serializeUiMessage({ type: "snapshot", devices: registry.getAllSnapshots() }));
        }
      },
      message(ws, message) {
        if (ws.data.role === "device") {
          handleDeviceSocketMessage(ws, message, registry, deviceSockets, server);
          return;
        }

        handleUiSocketMessage(ws, message, deviceSockets);
      },
      close(ws) {
        if (ws.data.role === "ui") {
          ws.unsubscribe(UI_TOPIC);
          return;
        }

        handleDeviceSocketClose(ws, registry, deviceSockets, server);
      },
    },
  });

  staleTimer = setInterval(() => {
    for (const snapshot of registry.refreshStaleStatus(Date.now())) {
      publishToUi(server, { type: "deviceStatus", device: snapshot });
    }
  }, STALE_SCAN_INTERVAL_MS);

  return {
    server,
    registry,
    stop() {
      if (staleTimer) {
        clearInterval(staleTimer);
      }

      server.stop(true);
    },
  };
}

function handleDeviceSocketClose(
  ws: HubWebSocket,
  registry: DeviceRegistry,
  deviceSockets: Map<string, HubWebSocket>,
  server: Bun.Server<ClientData>,
): void {
  const deviceId = ws.data.deviceId;
  if (!deviceId || deviceSockets.get(deviceId) !== ws) {
    return;
  }

  deviceSockets.delete(deviceId);
  const snapshot = registry.markDisconnected(deviceId, Date.now());
  if (snapshot) {
    publishToUi(server, { type: "deviceStatus", device: snapshot });
  }
}

function upgrade(
  request: Request,
  server: Bun.Server<ClientData>,
  data: ClientData,
): Response | undefined {
  const upgraded = server.upgrade(request, { data });

  if (upgraded) {
    return undefined;
  }

  return new Response("WebSocket upgrade failed", { status: 400 });
}

function handleDeviceSocketMessage(
  ws: HubWebSocket,
  message: string | Buffer,
  registry: DeviceRegistry,
  deviceSockets: Map<string, HubWebSocket>,
  server: Bun.Server<ClientData>,
): void {
  const parsed = parseDeviceMessage(message);
  if (!parsed.ok) {
    ws.send(serializeUiMessage({ type: "error", error: parsed.error }));
    return;
  }

  const receivedAt = Date.now();
  const update = registry.upsertFromMessage(parsed.message, receivedAt);
  ws.data.deviceId = parsed.message.deviceId;
  deviceSockets.set(parsed.message.deviceId, ws);

  publishToUi(server, {
    type: "deviceUpdate",
    device: update.snapshot,
    message: parsed.message,
    receivedAt,
    sequenceGap: update.sequenceGap,
  });
}

function handleUiSocketMessage(
  ws: HubWebSocket,
  message: string | Buffer,
  deviceSockets: Map<string, HubWebSocket>,
): void {
  const parsed = parseUiMessage(message);
  if (!parsed.ok) {
    ws.send(serializeUiMessage({ type: "error", error: parsed.error }));
    return;
  }

  forwardCommand(ws, parsed.message, deviceSockets);
}

function forwardCommand(
  uiSocket: HubWebSocket,
  command: UiCommandMessage,
  deviceSockets: Map<string, HubWebSocket>,
): void {
  const deviceSocket = deviceSockets.get(command.deviceId);

  if (!deviceSocket) {
    sendTargetDisconnectedError(uiSocket);
    return;
  }

  deviceSocket.send(serializeUiMessage({ type: command.type }));
}

function sendTargetDisconnectedError(uiSocket: HubWebSocket): void {
  uiSocket.send(
    serializeUiMessage({
      type: "error",
      error: { code: "invalid_shape", message: "Target device is not connected." },
    }),
  );
}

function publishToUi(server: Bun.Server<ClientData>, message: unknown): void {
  server.publish(UI_TOPIC, serializeUiMessage(message));
}

function serializeUiMessage(message: unknown): string {
  return JSON.stringify(message);
}
