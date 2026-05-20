<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Cable, Send, Unplug } from "lucide-svelte";
import type { ConfigureResult } from "$lib/serial-setup";

interface Props {
  ssid: string;
  password: string;
  serverUrl: string;
  deviceId: string;
  serialSupported: boolean;
  serialConnected: boolean;
  serialBusy: boolean;
  serialMessage: string;
  configureResult: ConfigureResult | undefined;
  serialLines: string[];
  connectSerial: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
  submitConfigure: () => Promise<void>;
}

let {
  ssid = $bindable(""),
  password = $bindable(""),
  serverUrl = $bindable(""),
  deviceId = $bindable(""),
  serialSupported,
  serialConnected,
  serialBusy,
  serialMessage,
  configureResult,
  serialLines,
  connectSerial,
  disconnectSerial,
  submitConfigure,
}: Props = $props();

const canSubmitConfigure = $derived(
  serialConnected && !serialBusy && Boolean(ssid.trim() && serverUrl.trim() && deviceId.trim()),
);
</script>

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
    <strong>{configureResult ? "configureResult" : "Serial status"}</strong>
    <span>{configureResult?.message ?? serialMessage}</span>
  </div>

  {#if serialLines.length > 0}
    <ul class="serial-lines" aria-label="Recent serial lines">
      {#each serialLines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
</section>
