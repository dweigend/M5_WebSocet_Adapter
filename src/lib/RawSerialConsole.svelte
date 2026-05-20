<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedImports: Svelte template uses component imports.
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte template uses these bindings.

import { Clipboard, Pause, Play, Trash2 } from "lucide-svelte";
import type { RawSerialEntry, UsbRawFrameType } from "$lib/usb-test-session";

const FILTERS: Array<"all" | "valid" | "invalid" | UsbRawFrameType> = [
  "all",
  "valid",
  "invalid",
  "register",
  "heartbeat",
  "imu",
  "orientation",
  "configureResult",
  "unsupported",
];

interface Props {
  rawLines: RawSerialEntry[];
  clearRawLog: () => void;
}

let { rawLines, clearRawLog }: Props = $props();

let paused = $state(false);
let filter = $state<(typeof FILTERS)[number]>("all");
let pausedLines = $state<RawSerialEntry[]>([]);
let copyMessage = $state("Ready");

const visibleLines = $derived(paused ? pausedLines : rawLines);

const filteredLines = $derived(
  visibleLines.filter((entry) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "valid") {
      return entry.valid;
    }

    if (filter === "invalid") {
      return !entry.valid;
    }

    return entry.frameType === filter;
  }),
);

async function copyVisibleLines(): Promise<void> {
  const text = filteredLines.map((entry) => entry.line).join("\n");

  if (!text || typeof navigator === "undefined" || !navigator.clipboard) {
    copyMessage = "Nothing copied";
    return;
  }

  await navigator.clipboard.writeText(text);
  copyMessage = "Copied";
}

function togglePaused(): void {
  if (!paused) {
    pausedLines = rawLines;
  }

  paused = !paused;
}
</script>

<section class="panel raw-console-panel" aria-labelledby="raw-console-title">
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Serial Console</p>
      <h2 id="raw-console-title">Raw Serial Lines</h2>
    </div>
    <div class="status-pill">
      <span>{rawLines.length} lines</span>
    </div>
  </div>

  <div class="console-toolbar">
    <label for="raw-filter">
      <span>Filter</span>
      <select id="raw-filter" bind:value={filter}>
        {#each FILTERS as nextFilter (nextFilter)}
          <option value={nextFilter}>{nextFilter}</option>
        {/each}
      </select>
    </label>
    <button type="button" class="icon-button" onclick={togglePaused}>
      {#if paused}
        <Play size={18} aria-hidden="true" />
        <span>Resume</span>
      {:else}
        <Pause size={18} aria-hidden="true" />
        <span>Pause</span>
      {/if}
    </button>
    <button type="button" class="icon-button" onclick={clearRawLog}>
      <Trash2 size={18} aria-hidden="true" />
      <span>Clear</span>
    </button>
    <button type="button" class="icon-button" onclick={copyVisibleLines}>
      <Clipboard size={18} aria-hidden="true" />
      <span>{copyMessage}</span>
    </button>
  </div>

  <ol class="raw-line-list" aria-label="Raw serial log">
    {#each filteredLines as entry (entry.id)}
      <li class:valid-line={entry.valid} class:invalid-line={!entry.valid}>
        <span>{entry.frameType}</span>
        <code>{entry.line}</code>
      </li>
    {:else}
      <li class="empty-console">No serial lines match the current filter.</li>
    {/each}
  </ol>
</section>
