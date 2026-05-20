<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Server } from "lucide-svelte";
import { browser } from "$app/environment";
import { type DeviceSnapshot, SAFE_MODE_TIMEOUT_MS } from "$lib/device-state";
import type { DeviceCommandType } from "$lib/protocol";
import SetupPanel from "$lib/SetupPanel.svelte";
import {
  type ConfigureResult,
  createConfigureRequest,
  isWebSerialSupported,
  SerialSetupConnection,
} from "$lib/serial-setup";
import TelemetryPanel from "$lib/TelemetryPanel.svelte";
import {
  createUiCommand,
  createUiWebSocketUrl,
  type UiServerMessage,
  UiTelemetrySocket,
} from "$lib/ui-websocket";

let ssid = $state("");
let password = $state("");
let serverUrl = $state("ws://localhost:8787/ws/device");
let deviceId = $state("m5stick-plus2-001");
let serialConnection: SerialSetupConnection | undefined;
let serialSupported = $state(false);
let serialConnected = $state(false);
let serialBusy = $state(false);
let serialMessage = $state("Web Serial is checked after the page loads.");
let configureResult: ConfigureResult | undefined = $state();
let serialLines = $state<string[]>([]);

let uiSocket: UiTelemetrySocket | undefined;
let uiConnected = $state(false);
let uiMessage = $state("Telemetry hub is disconnected.");
let devices = $state<DeviceSnapshot[]>([]);
let selectedDeviceId = $state("");
let currentTime = $state(Date.now());

const selectedDevice = $derived(
  devices.find((device) => device.deviceId === selectedDeviceId) ?? devices[0],
);
const localTelemetryAgeMs = $derived(
  selectedDevice?.lastTelemetryAt
    ? Math.max(0, currentTime - selectedDevice.lastTelemetryAt)
    : null,
);
const localSafeMode = $derived(
  !selectedDevice ||
    selectedDevice.safeMode ||
    !selectedDevice.connected ||
    localTelemetryAgeMs === null ||
    localTelemetryAgeMs > SAFE_MODE_TIMEOUT_MS,
);
const canSendCommand = $derived(Boolean(uiConnected && selectedDevice?.connected));
const lastMessageAgeMs = $derived(
  selectedDevice ? Math.max(0, currentTime - selectedDevice.lastMessageAt) : null,
);

$effect(() => {
  if (!browser) {
    return;
  }

  serialSupported = isWebSerialSupported();
  serialMessage = serialSupported
    ? "Ready to connect a Stick over USB serial."
    : "Web Serial is unavailable in this browser.";

  uiSocket = new UiTelemetrySocket(createUiWebSocketUrl(window.location));
  const unsubscribe = [
    uiSocket.on("open", () => {
      uiConnected = true;
      uiMessage = "Connected to telemetry hub.";
    }),
    uiSocket.on("close", () => {
      uiConnected = false;
      uiMessage = "Telemetry hub disconnected.";
    }),
    uiSocket.on("error", (message) => {
      uiMessage = message;
    }),
    uiSocket.on("message", handleUiMessage),
  ];
  uiSocket.connect();

  const clock = window.setInterval(() => {
    currentTime = Date.now();
  }, 500);

  return () => {
    window.clearInterval(clock);
    for (const unsubscribeListener of unsubscribe) {
      unsubscribeListener();
    }
    uiSocket?.disconnect();
    void disconnectSerial();
  };
});

async function connectSerial(): Promise<void> {
  if (!serialSupported || serialBusy) {
    return;
  }

  serialBusy = true;
  configureResult = undefined;

  try {
    serialConnection = new SerialSetupConnection();
    serialConnection.subscribe((event) => {
      if (event.type === "configureResult") {
        configureResult = event.result;
        serialMessage = event.result.message;
        return;
      }

      if (event.type === "line") {
        serialLines = [event.line, ...serialLines].slice(0, 4);
        return;
      }

      serialMessage = event.message;
    });
    await serialConnection.connect();
    serialConnected = true;
    serialMessage = "Serial port connected.";
  } catch (error) {
    serialMessage = error instanceof Error ? error.message : "Could not connect serial port.";
    serialConnection = undefined;
  } finally {
    serialBusy = false;
  }
}

async function disconnectSerial(): Promise<void> {
  serialBusy = true;

  try {
    await serialConnection?.disconnect();
  } finally {
    serialConnection = undefined;
    serialConnected = false;
    serialBusy = false;
    serialMessage = serialSupported
      ? "Serial port disconnected."
      : "Web Serial is unavailable in this browser.";
  }
}

async function submitConfigure(): Promise<void> {
  if (!serialConnection || serialBusy) {
    return;
  }

  serialBusy = true;
  configureResult = undefined;

  try {
    await serialConnection.sendConfigure(
      createConfigureRequest({ ssid, password, serverUrl, deviceId }),
    );
    serialMessage = "Configure message sent. Waiting for device response.";
  } catch (error) {
    serialMessage = error instanceof Error ? error.message : "Could not send configuration.";
  } finally {
    serialBusy = false;
  }
}

function handleUiMessage(message: UiServerMessage): void {
  if (message.type === "snapshot") {
    devices = message.devices;
    selectedDeviceId = selectedDeviceId || message.devices[0]?.deviceId || "";
    return;
  }

  if (message.type === "deviceUpdate" || message.type === "deviceStatus") {
    upsertDevice(message.device);
    return;
  }

  uiMessage = message.error.message;
}

function upsertDevice(nextDevice: DeviceSnapshot): void {
  const existingIndex = devices.findIndex((device) => device.deviceId === nextDevice.deviceId);

  if (existingIndex === -1) {
    devices = [...devices, nextDevice];
  } else {
    devices = devices.map((device) =>
      device.deviceId === nextDevice.deviceId ? nextDevice : device,
    );
  }

  selectedDeviceId = selectedDeviceId || nextDevice.deviceId;
}

function sendCommand(commandType: DeviceCommandType): void {
  if (!selectedDevice || !uiSocket) {
    return;
  }

  try {
    uiSocket.sendCommand(createUiCommand(commandType, selectedDevice.deviceId));
    uiMessage = `${commandType} sent to ${selectedDevice.deviceId}.`;
  } catch (error) {
    uiMessage = error instanceof Error ? error.message : "Could not send command.";
  }
}
</script>

<svelte:head>
  <title>M5 WebSocket Adapter</title>
</svelte:head>

<main class="app-shell">
  <header class="app-header">
    <div>
      <p class="eyebrow">Local M5StickC Plus2 Adapter</p>
      <h1>M5 WebSocket Adapter</h1>
    </div>
    <div class:status-pill={true} class:is-live={uiConnected}>
      <Server size={16} aria-hidden="true" />
      <span>{uiConnected ? "Hub online" : "Hub offline"}</span>
    </div>
  </header>

  <section class="dashboard-grid" aria-label="Adapter workspace">
    <SetupPanel
      bind:ssid
      bind:password
      bind:serverUrl
      bind:deviceId
      {serialSupported}
      {serialConnected}
      {serialBusy}
      {serialMessage}
      {configureResult}
      {serialLines}
      {connectSerial}
      {disconnectSerial}
      {submitConfigure}
    />

    <TelemetryPanel
      {devices}
      bind:selectedDeviceId
      {selectedDevice}
      {localSafeMode}
      {canSendCommand}
      {lastMessageAgeMs}
      {localTelemetryAgeMs}
      {uiMessage}
      {sendCommand}
    />
  </section>
</main>
