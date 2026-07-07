<script lang="ts">
  import type { PlaygroundSession } from "./session.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { session, wm }: { session: PlaygroundSession; wm: WindowManager<PgKey> } = $props();
</script>

<div class="state-pane">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bar drag-head"
    ondblclick={() => wm.toggleMaximize("state")}
    oncontextmenu={(e) => wm.openMenu("state", e)}
  >
    <span class="label">state</span>
    <div class="state-tools">
      <div class="help-wrap">
        <button class="help-btn mono" aria-label="state help">?</button>
        <div class="state-tooltip mono" role="tooltip">
          <div><b>mock state</b> is replayed top to bottom on every run.</div>
          <div><span>/start</span> sends a user message.</div>
          <div><span>click:buy</span> presses an inline button by callback data.</div>
          <div><span>inline:docs</span> sends an inline query.</div>
          <div><span>pre_checkout:coffee</span> sends a pre-checkout query.</div>
          <div><span>wait:1500</span> lets 1.5s of virtual time pass — timers fire.</div>
          <div><span>system: note</span> adds a visual note only.</div>
          <div>after the last step, pending timers get a {session.settleMs / 1000}s settle window.</div>
        </div>
      </div>
      <button
        class="cclear mono"
        onclick={() => session.clearState()}
        disabled={!session.steps.length}
        aria-label="clear mock state">clear</button
      >
    </div>
  </div>
  <div class="state-box state-window-body">
    <textarea
      class="state-input mono"
      bind:value={session.stepsText}
      rows="6"
      spellcheck="false"
      aria-label="mock messages already sent"
      placeholder={'/start\nsystem: user opened pricing\nclick:buy\nwait:1500\ninline:docs\npre_checkout:coffee'}
    ></textarea>
    <div class="state-actions">
      <button class="add" onclick={() => session.applyState()}>apply state</button>
      <button class="add ghosty" onclick={() => session.setSteps([...session.steps, { system: "checkpoint" }])}>+ system</button>
    </div>
    <p class="note">
      message line = incoming update · <span class="mono">click:buy</span> presses callback button ·
      <span class="mono">wait:1500</span> advances virtual time · <span class="mono">inline:...</span> sends inline query
    </p>
  </div>
</div>

<style>
  .state-pane {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--code-bg);
    border: 1px solid var(--code-stroke);
    border-radius: var(--border-radius);
    overflow: hidden;
  }

  .state-box {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 0 2px 4px;
  }

  .state-window-body {
    flex: 1;
    min-height: 0;
    padding: 10px;
  }

  .state-input {
    width: 100%;
    flex: 1;
    min-height: 104px;
    resize: vertical;
    padding: 9px 10px;
    border-radius: 10px;
    border: 1px solid var(--input-border);
    background: var(--button);
    color: var(--secondary);
    font-size: 12px;
    line-height: 1.55;
    outline: none;
  }

  .state-input:focus {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }

  .state-window-body .state-input {
    resize: none;
  }

  .state-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
  }

  .state-tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .help-wrap {
    position: relative;
  }

  .help-btn {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    padding: 0;
    background: var(--button);
    box-shadow: var(--button-box-shadow);
    color: var(--gray);
    font-size: 12px;
    font-weight: 700;
  }

  .help-btn:hover {
    color: var(--secondary);
    background: var(--button-hover);
  }

  .state-tooltip {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 40;
    width: 280px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--code-stroke);
    background: var(--primary);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
    color: var(--gray);
    font-size: 11px;
    line-height: 1.5;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.14s ease, transform 0.14s ease;
  }

  .state-tooltip span,
  .state-tooltip b {
    color: var(--secondary);
  }

  .help-wrap:hover .state-tooltip,
  .help-wrap:focus-within .state-tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  @media (max-width: 900px) {
    .state-pane {
      height: auto;
    }
  }
</style>
