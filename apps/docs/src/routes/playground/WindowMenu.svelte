<script lang="ts">
  import Menu from "$lib/ui/Menu.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { wm }: { wm: WindowManager<PgKey> } = $props();

  function act(fn: () => void) {
    fn();
    wm.closeMenu();
  }
</script>

<Menu
  open={!!wm.menu}
  onclose={wm.closeMenu}
  origin="top left"
  style={wm.menu ? `position: fixed; left:${wm.menu.x}px; top:${wm.menu.y}px;` : ""}
  label="window menu"
>
  {#if wm.menu}
    {@const key = wm.menu.key}
    <button onclick={() => act(() => wm.toggleMaximize(key))}>
      {wm.maximized === key ? "restore" : "maximize"}
    </button>
    <button onclick={() => act(() => wm.keyboardMove("w", true))}>dock left</button>
    <button onclick={() => act(() => wm.keyboardMove("e", true))}>dock right</button>
    <button onclick={() => act(() => wm.keyboardMove("n", true))}>dock up</button>
    <button onclick={() => act(() => wm.keyboardMove("s", true))}>dock down</button>
    <button onclick={() => act(() => wm.reset())}>reset layout</button>
  {/if}
</Menu>
