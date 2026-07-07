<script lang="ts">
  import type { Snippet } from "svelte";
  import { scale } from "svelte/transition";

  let {
    open = false,
    onclose,
    origin = "top right",
    style = "",
    class: cls = "",
    label = "menu",
    children,
  }: {
    open?: boolean;
    onclose: () => void;
    /** transform-origin of the pop animation, e.g. "top right" for header dropdowns. */
    origin?: string;
    /** positioning styles (left/top/right...) applied to the panel. */
    style?: string;
    class?: string;
    label?: string;
    children?: Snippet;
  } = $props();
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="menu-backdrop"
    onclick={onclose}
    oncontextmenu={(e) => {
      e.preventDefault();
      onclose();
    }}
  ></div>
  <div
    class="menu {cls}"
    style="transform-origin: {origin}; {style}"
    role="menu"
    aria-label={label}
    transition:scale={{ duration: 140, start: 0.94 }}
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
  }

  .menu {
    z-index: 10001;
    min-width: 150px;
    padding: 6px;
    border: 1px solid var(--code-stroke);
    border-radius: 12px;
    background: var(--code-bg);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
  }

  .menu :global(button) {
    width: 100%;
    display: block;
    padding: 8px 10px;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
    color: var(--secondary);
    font-size: 12px;
    text-align: left;
  }

  .menu :global(button:hover) {
    background: var(--button-hover);
  }
</style>
