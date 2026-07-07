<script lang="ts" generics="K extends string">
  import type { Snippet } from "svelte";
  import type { WindowManager } from "./window-manager.svelte";

  let {
    wm,
    key,
    label,
    children,
  }: {
    wm: WindowManager<K>;
    key: K;
    label: string;
    children?: Snippet;
  } = $props();
</script>

<section
  class="window"
  class:active-window={wm.active === key}
  class:moving={wm.moving === key}
  class:resizing={wm.resizing === key}
  style={wm.styleOf(key)}
  use:wm.interact={key}
  role="group"
  aria-label={label}
  tabindex="-1"
  onpointerdown={() => wm.focus(key)}
>
  {@render children?.()}
  {#each wm.resizeDirs(key) as dir}
    <div class="resize-handle resize-{dir}" role="separator" aria-label={`resize ${label} ${dir}`}></div>
  {/each}
</section>

<style>
  .window {
    position: absolute;
    min-width: 160px;
    border-radius: var(--border-radius);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
    transition:
      left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
      top 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
      width 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
      height 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }

  .window.active-window {
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 122, 255, 0.42);
  }

  .window.moving,
  .window.resizing {
    transition: none;
    box-shadow: 0 24px 58px rgba(0, 0, 0, 0.32);
    transform: scale(1.002);
  }

  .window.moving {
    opacity: 0.72;
  }

  .window :global(.drag-head) {
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .window :global(.drag-head:active) {
    cursor: grabbing;
  }

  .resize-handle {
    position: absolute;
    z-index: 20;
    touch-action: none;
    user-select: none;
    transition: background 0.12s ease;
  }

  .resize-handle:hover {
    background: rgba(0, 122, 255, 0.3);
  }

  .resize-e,
  .resize-w {
    top: 10px;
    bottom: 10px;
    width: 8px;
    cursor: ew-resize;
  }

  .resize-e {
    right: -4px;
  }

  .resize-w {
    left: -4px;
  }

  .resize-n,
  .resize-s {
    left: 10px;
    right: 10px;
    height: 8px;
    cursor: ns-resize;
  }

  .resize-n {
    top: -4px;
  }

  .resize-s {
    bottom: -4px;
  }

  @media (max-width: 900px) {
    .window {
      position: static;
      width: auto !important;
      height: auto !important;
      min-width: 0;
      box-shadow: none;
      transition: none;
    }

    .resize-handle {
      display: none;
    }
  }
</style>
