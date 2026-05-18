<script lang="ts">
import "../app.css";

interface Props {
  children?: import("svelte").Snippet;
}

// biome-ignore lint/correctness/noUnusedVariables: Svelte renders this snippet in the template.
let { children }: Props = $props();
</script>

{@render children?.()}
