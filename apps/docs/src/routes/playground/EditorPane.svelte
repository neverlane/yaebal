<script lang="ts">
  import MonacoEditor from "$lib/MonacoEditor.svelte";
  import type { PlaygroundSession } from "./session.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { session, wm }: { session: PlaygroundSession; wm: WindowManager<PgKey> } = $props();
</script>

<div class="pane">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bar drag-head"
    ondblclick={() => wm.toggleMaximize("editor")}
    oncontextmenu={(e) => wm.openMenu("editor", e)}
  >
    <div class="seg">
      <button class:on={session.mode === "mock"} onclick={() => (session.mode = "mock")}>mock</button>
      <button class:on={session.mode === "live"} onclick={() => (session.mode = "live")}>live</button>
    </div>
    <div class="bar-r">
      {#if session.mode === "mock"}
        <button
          class="auto mono"
          class:on={session.autoRun}
          onclick={() => (session.autoRun = !session.autoRun)}
          title="re-run the mock automatically after edits"
          aria-pressed={session.autoRun}
        >auto</button>
      {/if}
      <button class="run" class:danger={!!session.live} onclick={() => session.run()} disabled={session.busy}>
        {#if session.mode === "live" && session.live}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          <span>Stop</span>
        {:else if session.busy}
          <span class="spin" aria-hidden="true"></span>
          <span>running…</span>
        {:else}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.5v15l13-7.5-13-7.5Z" /></svg>
          <span>{session.mode === "live" ? "Start" : "Run"}</span>
        {/if}
      </button>
    </div>
  </div>
  <div class="editor"><MonacoEditor bind:value={session.code} theme={session.theme} /></div>
</div>

<style>
  .pane {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--code-bg);
    border: 1px solid var(--code-stroke);
    border-radius: var(--border-radius);
    overflow: hidden;
  }

  .seg {
    display: inline-flex;
    gap: 2px;
    background: var(--button);
    box-shadow: var(--button-box-shadow);
    border-radius: var(--border-radius);
    padding: 3.5px;
  }

  .seg button {
    font-size: 12px;
    padding: 5px 15px;
    border-radius: calc(var(--border-radius) - 3.5px);
    background: transparent;
    box-shadow: none;
    color: var(--gray);
    transition: background 0.16s ease, color 0.16s ease;
  }

  .seg button.on {
    background: var(--secondary);
    color: var(--primary);
  }

  .bar-r {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .auto {
    font-size: 11px;
    padding: 5px 11px;
    border-radius: var(--border-radius);
    background: transparent;
    box-shadow: none;
    color: var(--gray);
    border: 1px dashed var(--code-stroke);
    transition: color 0.16s ease, border-color 0.16s ease;
  }

  .auto.on {
    color: var(--green);
    border-style: solid;
    border-color: var(--green);
  }

  .run {
    padding: 6px 17px;
    font-size: 12.5px;
    font-weight: 500;
    border-radius: var(--border-radius);
    color: var(--primary);
    background: var(--secondary);
    box-shadow: none;
    transition: opacity 0.16s ease;
  }

  .run:hover {
    opacity: 0.86;
  }

  .run:disabled {
    opacity: 0.5;
  }

  .run.danger {
    color: var(--white);
    background: var(--red);
  }

  .run .spin {
    width: 11px;
    height: 11px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 999px;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .editor {
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 900px) {
    .pane {
      height: auto;
    }

    .editor {
      min-height: 360px;
    }
  }
</style>
