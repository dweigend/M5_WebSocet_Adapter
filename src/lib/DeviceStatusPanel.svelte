<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import {
  Activity,
  Battery,
  CirclePause,
  CirclePlay,
  Gauge,
  Power,
  Radar,
  RotateCcw,
  ShieldAlert,
  Wifi,
} from "lucide-svelte";
import type { CommandTransport, SourceAwareDeviceSnapshot } from "$lib/device-transport";
import type { DeviceCommandType } from "$lib/protocol";

const COMMANDS: Array<{ type: DeviceCommandType; label: string; icon: typeof RotateCcw }> = [
  { type: "calibrate", label: "Calibrate", icon: RotateCcw },
  { type: "pause", label: "Pause", icon: CirclePause },
  { type: "resume", label: "Resume", icon: CirclePlay },
  { type: "identify", label: "Identify", icon: Radar },
  { type: "reboot", label: "Reboot", icon: Power },
];

interface Props {
  devices: SourceAwareDeviceSnapshot[];
  selectedDeviceId: string;
  selectedDevice: SourceAwareDeviceSnapshot | undefined;
  canSendCommand: boolean;
  lastMessageAgeMs: number | null;
  localTelemetryAgeMs: number | null;
  uiMessage: string;
  commandTransport: CommandTransport | undefined;
  sendCommand: (commandType: DeviceCommandType) => Promise<void>;
}

let {
  devices,
  selectedDeviceId = $bindable(""),
  selectedDevice,
  canSendCommand,
  lastMessageAgeMs,
  localTelemetryAgeMs,
  uiMessage,
  commandTransport,
  sendCommand,
}: Props = $props();

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

<div class="device-stack">
  <label class="device-select" for="device-select">
    <span>Device</span>
    <select
      id="device-select"
      name="device-select"
      bind:value={selectedDeviceId}
      disabled={devices.length === 0}
    >
      {#if devices.length === 0}
        <option value="">No devices</option>
      {:else}
        {#each devices as device (device.deviceId)}
          <option value={device.deviceId}>{device.deviceId} ({device.source})</option>
        {/each}
      {/if}
    </select>
  </label>

  <div class="metric-grid">
    <article>
      <Activity size={18} aria-hidden="true" />
      <span>Source</span>
      <strong>{selectedDevice?.source ?? "-"}</strong>
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
    <div>
      <dt>Command route</dt>
      <dd>{commandTransport ?? "unavailable"}</dd>
    </div>
  </dl>

  <div class="command-grid" aria-label="Device controls">
    {#each COMMANDS as command (command.type)}
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
