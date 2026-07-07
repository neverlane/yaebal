<script lang="ts">
  import type { PlaygroundSession } from "./session.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { session, wm }: { session: PlaygroundSession; wm: WindowManager<PgKey> } = $props();
</script>

<div class="console">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="console-bar drag-head"
    ondblclick={() => wm.toggleMaximize("console")}
    oncontextmenu={(e) => wm.openMenu("console", e)}
  >
    <div class="cbar-l">
      <span class="ctitle">console</span>
      {#if session.logs.length}<span class="count mono">{session.logs.length}</span>{/if}
    </div>
    <button
      class="cclear mono"
      onclick={() => (session.logs = [])}
      disabled={!session.logs.length}
      aria-label="clear console">clear</button
    >
  </div>
  <div class="clog">
    {#if session.logs.length}
      {#each session.logs as l}
        <div class="line {l.level}">
          <span class="lv lv-{l.level}" aria-hidden="true"></span>
          <span class="ltext mono">{l.text}</span>
        </div>
      {/each}
    {:else}
      <div class="cempty mono">› console output appears here</div>
    {/if}
  </div>
</div>

<style>
  .console {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--primary);
    border: 1px solid var(--code-stroke);
    border-radius: var(--border-radius);
    overflow: hidden;
  }

  .console-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px 6px 12px;
    border-bottom: 1px solid var(--code-stroke);
    flex: none;
  }

  .cbar-l {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .ctitle {
    font-size: 11px;
    font-weight: 600;
    color: var(--secondary);
  }

  .count {
    font-size: 10px;
    min-width: 16px;
    text-align: center;
    padding: 1px 5px;
    border-radius: 7px;
    background: var(--button);
    color: var(--gray);
  }

  .clog {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }

  .cempty {
    padding: 10px 14px;
    font-size: 12px;
    color: var(--gray);
    opacity: 0.6;
  }

  .line {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    padding: 3px 14px 3px 10px;
    font-size: 12px;
    line-height: 1.55;
    border-bottom: 1px solid var(--code-stroke);
  }

  .line.warn {
    background: rgba(241, 179, 56, 0.06);
  }

  .line.error {
    background: rgba(237, 34, 54, 0.06);
  }

  .lv {
    flex: none;
    width: 3px;
    align-self: stretch;
    border-radius: 2px;
    background: transparent;
  }

  .lv-warn {
    background: var(--gold);
  }

  .lv-error {
    background: var(--red);
  }

  .ltext {
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--secondary);
  }

  .line.warn .ltext {
    color: var(--gold);
  }

  .line.error .ltext {
    color: var(--red);
  }

  @media (max-width: 900px) {
    .console {
      height: auto;
      min-height: 180px;
    }
  }
</style>
