<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { ShieldAlert } from "lucide-svelte";
import DeviceStatusPanel from "$lib/DeviceStatusPanel.svelte";
import type { DeviceSnapshot } from "$lib/device-state";
import OrientationScene from "$lib/OrientationScene.svelte";
import type { DeviceCommandType } from "$lib/protocol";

interface Props {
  devices: DeviceSnapshot[];
  selectedDeviceId: string;
  selectedDevice: DeviceSnapshot | undefined;
  localSafeMode: boolean;
  canSendCommand: boolean;
  lastMessageAgeMs: number | null;
  localTelemetryAgeMs: number | null;
  uiMessage: string;
  sendCommand: (commandType: DeviceCommandType) => void;
}

let {
  devices,
  selectedDeviceId = $bindable(""),
  selectedDevice,
  localSafeMode,
  canSendCommand,
  lastMessageAgeMs,
  localTelemetryAgeMs,
  uiMessage,
  sendCommand,
}: Props = $props();
</script>

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

    <DeviceStatusPanel
      {devices}
      bind:selectedDeviceId
      {selectedDevice}
      {canSendCommand}
      {lastMessageAgeMs}
      {localTelemetryAgeMs}
      {uiMessage}
      {sendCommand}
    />
  </div>
</section>
