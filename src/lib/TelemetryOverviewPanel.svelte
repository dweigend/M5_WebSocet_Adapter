<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import type { SourceAwareDeviceSnapshot } from "$lib/device-transport";

interface Props {
  selectedDevice: SourceAwareDeviceSnapshot | undefined;
  telemetryRateHz: number;
}

let { selectedDevice, telemetryRateHz }: Props = $props();

function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? "-" : value.toFixed(digits);
}

function formatPercent(value: number | undefined): string {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}
</script>

<section class="panel telemetry-overview-panel" aria-labelledby="telemetry-overview-title">
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Parsed Telemetry</p>
      <h2 id="telemetry-overview-title">Telemetry Overview</h2>
    </div>
    <div class="status-pill">
      <span>{selectedDevice?.source ?? "none"}</span>
    </div>
  </div>

  <div class="overview-grid">
    <article>
      <span>Heartbeat</span>
      <strong>{selectedDevice?.heartbeat ? "received" : "missing"}</strong>
      <small>
        RSSI {selectedDevice?.heartbeat?.rssi ?? "-"} dBm · heap
        {selectedDevice?.heartbeat?.freeHeap ?? "-"} B
      </small>
    </article>
    <article>
      <span>Accel</span>
      <strong>
        x {formatNumber(selectedDevice?.imu?.accel.x)} · y
        {formatNumber(selectedDevice?.imu?.accel.y)} · z
        {formatNumber(selectedDevice?.imu?.accel.z)}
      </strong>
    </article>
    <article>
      <span>Gyro</span>
      <strong>
        x {formatNumber(selectedDevice?.imu?.gyro.x)} · y
        {formatNumber(selectedDevice?.imu?.gyro.y)} · z
        {formatNumber(selectedDevice?.imu?.gyro.z)}
      </strong>
    </article>
    <article>
      <span>Pitch / Roll / Yaw</span>
      <strong>
        {formatNumber(selectedDevice?.orientation?.pitch)} /
        {formatNumber(selectedDevice?.orientation?.roll)} /
        {formatNumber(selectedDevice?.orientation?.yaw)}
      </strong>
    </article>
    <article>
      <span>Sequence</span>
      <strong>{selectedDevice?.lastSeq ?? "-"}</strong>
      <small>expected {selectedDevice?.expectedSeq ?? "-"}</small>
    </article>
    <article>
      <span>Packet loss</span>
      <strong>{formatPercent(selectedDevice?.packetLossEstimate)}</strong>
      <small>{selectedDevice?.lostMessages ?? 0} lost</small>
    </article>
    <article>
      <span>USB telemetry rate</span>
      <strong>{telemetryRateHz.toFixed(1)} Hz</strong>
    </article>
    <article>
      <span>Streaming</span>
      <strong>{selectedDevice?.heartbeat?.streaming ? "yes" : "no"}</strong>
      <small>calibrated {selectedDevice?.heartbeat?.calibrated ? "yes" : "no"}</small>
    </article>
  </div>
</section>
