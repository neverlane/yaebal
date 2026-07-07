<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, scale } from "svelte/transition";

  let {
    open = false,
    onclose,
    label = "dialog",
    width = 680,
    children,
  }: {
    open?: boolean;
    onclose: () => void;
    label?: string;
    /** max panel width in px — the panel shrinks with the viewport. */
    width?: number;
    children?: Snippet;
  } = $props();

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel"
      style="width: min({width}px, 100%);"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      transition:scale={{ duration: 170, start: 0.96 }}
    >
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(8px);
  }

  .modal-panel {
    max-height: min(760px, calc(100dvh - 40px));
    overflow: auto;
    background: var(--code-bg);
    border: 1px solid var(--code-stroke);
    border-radius: 18px;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
    padding: 16px;
  }
</style>
