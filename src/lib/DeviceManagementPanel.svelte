<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Send } from "lucide-svelte";
import type { ConfigureResult } from "$lib/serial-setup";

interface Props {
  ssid: string;
  password: string;
  serverUrl: string;
  deviceId: string;
  usbSupported: boolean;
  usbConnected: boolean;
  usbBusy: boolean;
  configureResult: ConfigureResult | undefined;
  usbMessage: string;
  submitConfigure: () => Promise<void>;
}

let {
  ssid = $bindable(""),
  password = $bindable(""),
  serverUrl = $bindable(""),
  deviceId = $bindable(""),
  usbSupported,
  usbConnected,
  usbBusy,
  configureResult,
  usbMessage,
  submitConfigure,
}: Props = $props();

const canSubmitConfigure = $derived(
  usbConnected && !usbBusy && Boolean(ssid.trim() && serverUrl.trim() && deviceId.trim()),
);
</script>

<section class="panel management-panel" aria-labelledby="management-title">
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Device Management V1</p>
      <h2 id="management-title">USB Setup</h2>
    </div>
    <div class:status-pill={true} class:is-live={usbConnected}>
      <span>{usbConnected ? "Setup ready" : "USB required"}</span>
    </div>
  </div>

  <form class="setup-form" onsubmit={(event) => event.preventDefault()}>
    <label for="ssid">
      <span>SSID</span>
      <input
        id="ssid"
        name="ssid"
        autocomplete="off"
        bind:value={ssid}
        disabled={!usbSupported}
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
        disabled={!usbSupported}
      />
    </label>
    <label for="server-url">
      <span>Device WebSocket URL</span>
      <input
        id="server-url"
        name="server-url"
        bind:value={serverUrl}
        disabled={!usbSupported}
        required
      />
    </label>
    <label for="device-id">
      <span>Device ID</span>
      <input
        id="device-id"
        name="device-id"
        bind:value={deviceId}
        disabled={!usbSupported}
        required
      />
    </label>

    <button
      type="button"
      class="primary-button"
      disabled={!canSubmitConfigure}
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
    <strong>{configureResult ? "configureResult" : "Firmware management"}</strong>
    <span>{configureResult?.message ?? usbMessage}</span>
    <small>Browser flashing is intentionally not active in V1.</small>
  </div>
</section>
