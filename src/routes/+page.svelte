<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import {
  Activity,
  Battery,
  Cable,
  CirclePause,
  CirclePlay,
  Gauge,
  Power,
  Radar,
  RotateCcw,
  Send,
  Server,
  ShieldAlert,
  Unplug,
  Wifi,
} from "lucide-svelte";
import { browser } from "$app/environment";
import { type DeviceSnapshot, SAFE_MODE_TIMEOUT_MS } from "$lib/device-state";
import OrientationScene from "$lib/OrientationScene.svelte";
import type { DeviceCommandType } from "$lib/protocol";
import {
  type ConfigureResult,
  createConfigureRequest,
  isWebSerialSupported,
  SerialSetupConnection,
} from "$lib/serial-setup";
import {
  createUiCommand,
  createUiWebSocketUrl,
  type UiServerMessage,
  UiTelemetrySocket,
} from "$lib/ui-websocket";

const COMMANDS: Array<{ type: DeviceCommandType; label: string; icon: typeof RotateCcw }> = [
  { type: "calibrate", label: "Calibrate", icon: RotateCcw },
  { type: "pause", label: "Pause", icon: CirclePause },
  { type: "resume", label: "Resume", icon: CirclePlay },
  { type: "identify", label: "Identify", icon: Radar },
  { type: "reboot", label: "Reboot", icon: Power },
];

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

function formatAge(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "never";
  }

  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)} ms`;
  }

  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

function formatPercent(value: number | undefined): string {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
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
    <section class="panel setup-panel" aria-labelledby="setup-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">WP4</p>
          <h2 id="setup-title">Serial Setup</h2>
        </div>
        <div class:status-pill={true} class:is-live={serialConnected}>
          <Cable size={16} aria-hidden="true" />
          <span>{serialConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <div class="button-row">
        <button
          type="button"
          class="icon-button"
          disabled={!serialSupported || serialBusy || serialConnected}
          onclick={connectSerial}
          title="Connect serial port"
        >
          <Cable size={18} aria-hidden="true" />
          <span>Connect</span>
        </button>
        <button
          type="button"
          class="icon-button"
          disabled={!serialConnected || serialBusy}
          onclick={disconnectSerial}
          title="Disconnect serial port"
        >
          <Unplug size={18} aria-hidden="true" />
          <span>Disconnect</span>
        </button>
      </div>

      <form class="setup-form" onsubmit={(event) => event.preventDefault()}>
        <label for="ssid">
          <span>SSID</span>
          <input
            id="ssid"
            name="ssid"
            autocomplete="off"
            bind:value={ssid}
            disabled={!serialSupported}
            required
          />
        </label>
        <label for="password">
          <span>Password</span>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            disabled={!serialSupported}
          />
        </label>
        <label for="server-url">
          <span>Server URL</span>
          <input
            id="server-url"
            name="server-url"
            bind:value={serverUrl}
            disabled={!serialSupported}
            required
          />
        </label>
        <label for="device-id">
          <span>Device ID</span>
          <input
            id="device-id"
            name="device-id"
            bind:value={deviceId}
            disabled={!serialSupported}
            required
          />
        </label>

        <button
          type="button"
          class="primary-button"
          disabled={!serialConnected || serialBusy || !ssid.trim() || !serverUrl.trim() || !deviceId.trim()}
          onclick={submitConfigure}
        >
          <Send size={18} aria-hidden="true" />
          <span>Send Configure</span>
        </button>
      </form>

      <div
        class:result-box={true}
        class:is-success={configureResult?.ok}
        class:is-error={configureResult && !configureResult.ok}
        role="status"
      >
        <strong>{configureResult ? "configureResult" : "Serial status"}</strong>
        <span>{configureResult?.message ?? serialMessage}</span>
      </div>

      {#if serialLines.length > 0}
        <ul class="serial-lines" aria-label="Recent serial lines">
          {#each serialLines as line}
            <li>{line}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel telemetry-panel" aria-labelledby="telemetry-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">WP5</p>
          <h2 id="telemetry-title">Live Telemetry</h2>
        </div>
        {#if localSafeMode}
          <div class="status-pill is-alert">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>Safe Mode</span>
          </div>
        {/if}
      </div>

      <div class="telemetry-layout">
        <div class="visual-stage">
          <OrientationScene orientation={selectedDevice?.orientation} safeMode={localSafeMode} />
        </div>

        <div class="device-stack">
          <label class="device-select" for="device-select">
            <span>Device</span>
            <select id="device-select" name="device-select" bind:value={selectedDeviceId} disabled={devices.length === 0}>
              {#if devices.length === 0}
                <option value="">No devices</option>
              {:else}
                {#each devices as device}
                  <option value={device.deviceId}>{device.deviceId}</option>
                {/each}
              {/if}
            </select>
          </label>

          <div class="metric-grid">
            <article>
              <Activity size={18} aria-hidden="true" />
              <span>Connected</span>
              <strong>{selectedDevice?.connected ? "yes" : "no"}</strong>
            </article>
            <article>
              <RotateCcw size={18} aria-hidden="true" />
              <span>Calibrated</span>
              <strong>{selectedDevice?.heartbeat?.calibrated ? "yes" : "no"}</strong>
            </article>
            <article>
              <Wifi size={18} aria-hidden="true" />
              <span>RSSI</span>
              <strong>{selectedDevice?.heartbeat?.rssi ?? "-"} dBm</strong>
            </article>
            <article>
              <Gauge size={18} aria-hidden="true" />
              <span>Heap</span>
              <strong>{selectedDevice?.heartbeat?.freeHeap ?? "-"} B</strong>
            </article>
            <article>
              <Battery size={18} aria-hidden="true" />
              <span>Battery</span>
              <strong>{selectedDevice?.heartbeat?.batteryVoltage?.toFixed(2) ?? "-"} V</strong>
            </article>
            <article>
              <ShieldAlert size={18} aria-hidden="true" />
              <span>Packet loss</span>
              <strong>{formatPercent(selectedDevice?.packetLossEstimate)}</strong>
            </article>
          </div>

          <dl class="status-list">
            <div>
              <dt>Last message</dt>
              <dd>{formatAge(lastMessageAgeMs)}</dd>
            </div>
            <div>
              <dt>Telemetry age</dt>
              <dd>{formatAge(localTelemetryAgeMs)}</dd>
            </div>
            <div>
              <dt>Hub status</dt>
              <dd>{uiMessage}</dd>
            </div>
          </dl>

          <div class="command-grid" aria-label="Device controls">
            {#each COMMANDS as command}
              <button
                type="button"
                class="icon-button"
                disabled={!canSendCommand}
                onclick={() => sendCommand(command.type)}
                title={command.label}
              >
                <command.icon size={18} aria-hidden="true" />
                <span>{command.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>
  </section>
</main>
