<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Cable, Gauge, ScanLine, Terminal, Unplug, XCircle } from "lucide-svelte";
import type { UsbTestSessionState } from "$lib/usb-test-session";

interface Props {
  usbState: UsbTestSessionState;
  lastFrameAgeMs: number | null;
  connectUsb: () => Promise<void>;
  disconnectUsb: () => Promise<void>;
  testUsb: () => Promise<void>;
}

let { usbState, lastFrameAgeMs, connectUsb, disconnectUsb, testUsb }: Props = $props();

function formatAge(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "never";
  }

  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)} ms`;
  }

  return `${(milliseconds / 1_000).toFixed(1)} s`;
}
</script>

<section class="panel usb-test-panel" aria-labelledby="usb-test-title">
  <div class="panel-heading">
    <div>
      <p class="eyebrow">USB Test Mode</p>
      <h2 id="usb-test-title">Live USB Session</h2>
    </div>
    <div class:status-pill={true} class:is-live={usbState.connected}>
      <Cable size={16} aria-hidden="true" />
      <span>{usbState.connected ? "USB online" : "USB offline"}</span>
    </div>
  </div>

  <div class="button-row">
    <button
      type="button"
      class="icon-button"
      disabled={!usbState.supported || usbState.busy || usbState.connected}
      onclick={testUsb}
      title="Test USB serial port"
    >
      <ScanLine size={18} aria-hidden="true" />
      <span>Test USB</span>
    </button>
    <button
      type="button"
      class="icon-button"
      disabled={!usbState.supported || usbState.busy || usbState.connected}
      onclick={connectUsb}
      title="Connect via USB serial"
    >
      <Cable size={18} aria-hidden="true" />
      <span>Connect USB</span>
    </button>
    <button
      type="button"
      class="icon-button"
      disabled={!usbState.connected || usbState.busy}
      onclick={disconnectUsb}
      title="Disconnect USB serial"
    >
      <Unplug size={18} aria-hidden="true" />
      <span>Disconnect</span>
    </button>
  </div>

  <div class="metric-grid compact-metrics">
    <article>
      <Gauge size={18} aria-hidden="true" />
      <span>Telemetry rate</span>
      <strong>{usbState.telemetryRateHz.toFixed(1)} Hz</strong>
    </article>
    <article>
      <Terminal size={18} aria-hidden="true" />
      <span>Valid frames</span>
      <strong>{usbState.validFrameCount}</strong>
    </article>
    <article>
      <XCircle size={18} aria-hidden="true" />
      <span>Invalid lines</span>
      <strong>{usbState.invalidLineCount}</strong>
    </article>
    <article>
      <Cable size={18} aria-hidden="true" />
      <span>Last frame</span>
      <strong>{formatAge(lastFrameAgeMs)}</strong>
    </article>
  </div>

  <dl class="status-list">
    <div>
      <dt>Status</dt>
      <dd>{usbState.message}</dd>
    </div>
    <div>
      <dt>Last parse error</dt>
      <dd>{usbState.lastParseError ?? "none"}</dd>
    </div>
  </dl>

  <div class="frame-counter-grid" aria-label="USB frame counters">
    {#each Object.entries(usbState.frameCounters) as [frameType, count] (frameType)}
      <span>{frameType}</span>
      <strong>{count}</strong>
    {/each}
  </div>
</section>
