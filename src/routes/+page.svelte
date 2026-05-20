<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Server } from "lucide-svelte";
import { onMount } from "svelte";
import { browser } from "$app/environment";
import DeviceManagementPanel from "$lib/DeviceManagementPanel.svelte";
import { type DeviceSnapshot, SAFE_MODE_TIMEOUT_MS } from "$lib/device-state";
import { chooseCommandTransport, mergeSourceAwareDevices } from "$lib/device-transport";
import type { DeviceCommandType } from "$lib/protocol";
import RawSerialConsole from "$lib/RawSerialConsole.svelte";
import { createConfigureRequest } from "$lib/serial-setup";
import TelemetryOverviewPanel from "$lib/TelemetryOverviewPanel.svelte";
import TelemetryPanel from "$lib/TelemetryPanel.svelte";
import UsbTestModePanel from "$lib/UsbTestModePanel.svelte";
import {
  createUiCommand,
  createUiWebSocketUrl,
  type UiServerMessage,
  UiTelemetrySocket,
} from "$lib/ui-websocket";
import { createInitialUsbState, UsbTestSession } from "$lib/usb-test-session";

let ssid = $state("");
let password = $state("");
let serverUrl = $state("ws://localhost:8787/ws/device");
let deviceId = $state("m5stick-plus2-001");
let usbSession: UsbTestSession | undefined;
let usbState = $state(createInitialUsbState());

let uiSocket: UiTelemetrySocket | undefined;
let uiConnected = $state(false);
let uiMessage = $state("Telemetry hub is disconnected.");
let hubDevices = $state<DeviceSnapshot[]>([]);
let selectedDeviceId = $state("");
let currentTime = $state(Date.now());

const devices = $derived(mergeSourceAwareDevices(hubDevices, usbState.devices));
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
const commandTransport = $derived(
  chooseCommandTransport({
    device: selectedDevice,
    usbAvailable: usbState.connected,
    hubAvailable: uiConnected,
  }),
);
const canSendCommand = $derived(Boolean(commandTransport && selectedDevice?.connected));
const lastMessageAgeMs = $derived(
  selectedDevice ? Math.max(0, currentTime - selectedDevice.lastMessageAt) : null,
);
const lastUsbFrameAgeMs = $derived(
  usbState.lastFrameAt === null ? null : Math.max(0, currentTime - usbState.lastFrameAt),
);

onMount(() => {
  if (!browser) {
    return;
  }

  usbSession = new UsbTestSession();
  const unsubscribeUsbSession = usbSession.subscribe((nextState) => {
    usbState = nextState;
  });
  usbSession.initialize();

  uiSocket = new UiTelemetrySocket(
    createUiWebSocketUrl(window.location, {
      hubUrl: import.meta.env.PUBLIC_M5_HUB_URL,
      hubPort: import.meta.env.PUBLIC_M5_HUB_PORT,
    }),
  );
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
    const now = Date.now();
    currentTime = now;
    usbSession?.refresh(now);
  }, 500);

  return () => {
    window.clearInterval(clock);
    unsubscribeUsbSession();
    for (const unsubscribeListener of unsubscribe) {
      unsubscribeListener();
    }
    uiSocket?.disconnect();
    void usbSession?.disconnect();
  };
});

async function submitConfigure(): Promise<void> {
  if (!usbSession || usbState.busy) {
    return;
  }

  await usbSession.sendConfigure(createConfigureRequest({ ssid, password, serverUrl, deviceId }));
}

function handleUiMessage(message: UiServerMessage): void {
  if (message.type === "snapshot") {
    hubDevices = message.devices;
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
  const existingIndex = hubDevices.findIndex((device) => device.deviceId === nextDevice.deviceId);

  if (existingIndex === -1) {
    hubDevices = [...hubDevices, nextDevice];
  } else {
    hubDevices = hubDevices.map((device) =>
      device.deviceId === nextDevice.deviceId ? nextDevice : device,
    );
  }

  selectedDeviceId = selectedDeviceId || nextDevice.deviceId;
}

async function sendCommand(commandType: DeviceCommandType): Promise<void> {
  if (!selectedDevice) {
    return;
  }

  try {
    if (commandTransport === "usb") {
      await usbSession?.sendCommand(commandType);
      return;
    }

    if (commandTransport === "hub" && uiSocket) {
      uiSocket.sendCommand(createUiCommand(commandType, selectedDevice.deviceId));
      uiMessage = `${commandType} sent to ${selectedDevice.deviceId}.`;
      return;
    }

    uiMessage = "No command transport is available.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send command.";
    uiMessage = message;
  }
}

async function connectUsb(): Promise<void> {
  await usbSession?.connect();
}

async function disconnectUsb(): Promise<void> {
  await usbSession?.disconnect();
}

async function testUsb(): Promise<void> {
  await usbSession?.testConnection();
}

function clearRawLog(): void {
  usbSession?.clearRawLog();
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
    <div class="side-stack">
      <UsbTestModePanel
        {usbState}
        lastFrameAgeMs={lastUsbFrameAgeMs}
        {connectUsb}
        {disconnectUsb}
        {testUsb}
      />

      <DeviceManagementPanel
        bind:ssid
        bind:password
        bind:serverUrl
        bind:deviceId
        usbSupported={usbState.supported}
        usbConnected={usbState.connected}
        usbBusy={usbState.busy}
        configureResult={usbState.configureResult}
        usbMessage={usbState.message}
        {submitConfigure}
      />
    </div>

    <div class="main-stack">
      <TelemetryPanel
        {devices}
        bind:selectedDeviceId
        {selectedDevice}
        {localSafeMode}
        {canSendCommand}
        {lastMessageAgeMs}
        {localTelemetryAgeMs}
        {uiMessage}
        {commandTransport}
        {sendCommand}
      />

      <TelemetryOverviewPanel {selectedDevice} telemetryRateHz={usbState.telemetryRateHz} />

      <RawSerialConsole rawLines={usbState.rawLines} {clearRawLog} />
    </div>
  </section>
</main>
