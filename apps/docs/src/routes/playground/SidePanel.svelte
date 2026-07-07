<script lang="ts">
  import { EXAMPLES } from "$lib/examples";
  import type { PlaygroundSession } from "./session.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { session, wm }: { session: PlaygroundSession; wm: WindowManager<PgKey> } = $props();

  function renameKey(e: KeyboardEvent) {
    if (e.key === "Enter") session.finishRename();
    else if (e.key === "Escape") session.cancelRename();
  }
</script>

<aside class="side">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="side-h drag-head"
    ondblclick={() => wm.toggleMaximize("side")}
    oncontextmenu={(e) => wm.openMenu("side", e)}
  >
    <span>work tree</span>
    <button class="mini" onclick={() => session.addProject()} aria-label="new project">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  </div>
  <ul class="projects">
    {#each session.projects as p (p.id)}
      <li class:active={p.id === session.activeId}>
        {#if session.editingProjectId === p.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="pname-input mono"
            bind:value={session.editingProjectName}
            autofocus
            onblur={() => session.finishRename()}
            onkeydown={renameKey}
            aria-label="project name"
          />
        {:else}
          <button
            class="pname"
            onclick={() => session.switchProject(p.id)}
            ondblclick={() => session.startRename(p)}
            title="double-click to rename">{p.name}</button
          >
        {/if}
        <button class="mini ghost" onclick={() => session.deleteProject(p.id)} aria-label="delete project">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </li>
    {/each}
  </ul>
  <p class="note work-note">projects stay local in this browser</p>
  <div class="side-h"><span>examples</span></div>
  <ul class="projects examples">
    {#each Object.entries(EXAMPLES) as [id, ex] (id)}
      <li>
        <button class="pname" onclick={() => session.importExample(id)} title="add as a new project">{ex.title}</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .side {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--code-bg);
    border: 1px solid var(--code-stroke);
    border-radius: var(--border-radius);
    overflow: hidden;
    padding: 10px;
    gap: 1px;
    overflow-y: auto;
  }

  .work-note {
    margin: 10px 6px 0;
  }

  .side-h {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin: 12px 6px 6px;
    flex: none;
  }

  .side-h:first-child {
    margin-top: 2px;
  }

  .projects {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: none;
  }

  .projects li {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 12px;
    padding: 4px;
    transition: background 0.12s;
  }

  .projects li:hover {
    background: var(--button);
  }

  .projects li.active {
    background: var(--secondary);
  }

  .pname {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: transparent;
    box-shadow: none;
    padding: 9px 4px 9px 8px;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pname-input {
    flex: 1;
    min-width: 0;
    padding: 9px 8px;
    border: 1px solid var(--blue);
    border-radius: 10px;
    background: var(--button);
    color: var(--secondary);
    font-size: 13.5px;
    font-weight: 600;
    outline: none;
  }

  .projects li.active .pname {
    color: var(--primary);
  }

  .projects li.active :global(.mini.ghost) {
    color: var(--primary);
    opacity: 0.85;
    background: rgba(0, 0, 0, 0.1);
  }

  .projects li.active :global(.mini.ghost:hover) {
    opacity: 1;
    background: rgba(0, 0, 0, 0.16);
  }

  .examples .pname {
    font-weight: 400;
    color: var(--gray);
  }

  .examples li:hover .pname {
    color: var(--secondary);
  }

  @media (max-width: 900px) {
    .side {
      height: auto;
    }
  }
</style>
