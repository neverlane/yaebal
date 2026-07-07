<script lang="ts">
  import { renderChat } from "@yaebal/preview";
  import type { PlaygroundSession } from "./session.svelte";
  import type { PgKey } from "./keys";
  import type { WindowManager } from "./window-manager.svelte";

  let { session, wm }: { session: PlaygroundSession; wm: WindowManager<PgKey> } = $props();

  let chatEl = $state<HTMLDivElement>();

  $effect(() => {
    session.chatEl = chatEl;
  });

  // live mode renders incrementally: every streamed message re-renders the chat
  $effect(() => {
    const msgs = session.liveMsgs;
    if (session.mode !== "live" || !msgs.length) return;

    session.svg = renderChat(msgs, {
      theme: session.theme,
      width: Math.max(280, Math.round(chatEl?.clientWidth || 360)),
    });
  });

  /**
   * reveal messages with a staggered fade-in. delays follow the virtual
   * timestamps feedSteps stamped on the conversation: "settle" compresses them
   * into a quick cascade after every run, "replay" (the ↻ button) stretches
   * them so `wait:`/setTimeout pauses read as actual pauses.
   */
  function reveal(kind: "settle" | "replay", lastOnly = false) {
    const root = chatEl?.querySelector(".chat-svg svg");
    if (!root) return;

    const groups = Array.from(root.querySelectorAll<SVGGElement>("g.yb-msg"));
    if (!groups.length) return;

    if (lastOnly) {
      groups.at(-1)?.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" },
      );
      return;
    }

    const times = session.convo.map((m) => m.at ?? 0);
    const cfg =
      kind === "replay"
        ? { factor: 0.4, min: 160, max: 1400, dur: 320 }
        : { factor: 0.06, min: 55, max: 320, dur: 260 };

    let acc = 0;
    groups.forEach((g, i) => {
      if (i > 0) {
        const gap = Math.max(0, (times[i] ?? 0) - (times[i - 1] ?? 0));
        acc += Math.min(cfg.max, Math.max(cfg.min, gap * cfg.factor));
      }

      g.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: cfg.dur, delay: acc, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" },
      );
    });
  }

  // animate whenever a fresh chat lands: full cascade for mock runs, just the
  // newest message for live streaming
  $effect(() => {
    const svg = session.svg;
    const isLive = session.mode === "live" && !!session.live;
    if (!svg) return;

    requestAnimationFrame(() => reveal("settle", isLive));
  });
</script>

<div class="pane">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bar drag-head"
    ondblclick={() => wm.toggleMaximize("result")}
    oncontextmenu={(e) => wm.openMenu("result", e)}
  >
    <span class="label">result</span>
    <div class="bar-tools">
      {#if session.mode === "live" && session.live}
        <span class="dot"><span class="pulse" aria-hidden="true"></span>live</span>
      {/if}
      {#if session.mode === "mock" && session.convo.length > 1}
        <button
          class="cclear mono"
          onclick={() => reveal("replay")}
          title="replay the conversation with real pacing"
          aria-label="replay conversation">↻ replay</button
        >
      {/if}
    </div>
  </div>
  <div class="chat" bind:this={chatEl}>
    {#if session.error}
      <pre class="err mono">{session.error}</pre>
    {:else if session.mode === "mock" && !session.steps.length}
      <div class="empty state-empty">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></svg>
        <span class="mono">state is empty</span>
      </div>
    {:else if session.svg}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="chat-svg">{@html session.svg}</div>
    {:else}
      <div class="empty">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        <span class="mono">{session.mode === "live" ? "press start, then message your bot" : "run to see the conversation"}</span>
      </div>
    {/if}
  </div>
  {#if session.mode === "mock"}
    <div class="composer">
      <input
        class="msg mono"
        placeholder="message the bot…"
        bind:value={session.msg}
        onkeydown={(e) => e.key === "Enter" && session.send()}
      />
      <button class="send" onclick={() => session.send()} disabled={session.busy} aria-label="send message">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
      </button>
    </div>
  {/if}
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

  .bar-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--green);
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--green);
    box-shadow: 0 0 0 0 rgba(48, 189, 27, 0.5);
    animation: pulse 1.6s ease-out infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(48, 189, 27, 0.45);
    }
    70% {
      box-shadow: 0 0 0 6px rgba(48, 189, 27, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(48, 189, 27, 0);
    }
  }

  .chat {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .chat-svg {
    animation: fade 0.25s ease;
  }

  .chat :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 14px;
  }

  @keyframes fade {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .empty {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 11px;
    color: var(--gray);
    font-size: 12px;
  }

  .empty svg {
    opacity: 0.4;
  }

  .state-empty {
    text-transform: lowercase;
  }

  .err {
    margin: 0;
    padding: 12px 14px;
    color: var(--red);
    font-size: 12.5px;
    white-space: pre-wrap;
    background: var(--button);
    border-radius: 10px;
  }

  .composer {
    flex: none;
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--code-stroke);
  }

  .msg {
    flex: 1;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--button);
    border: 1px solid var(--input-border);
    color: var(--secondary);
    font-size: 13px;
    outline: none;
  }

  .msg:focus {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }

  .send {
    width: 42px;
    flex: none;
    border-radius: 10px;
    background: var(--button);
    box-shadow: var(--button-box-shadow);
    color: var(--secondary);
    font-size: 15px;
  }

  .send:hover {
    background: var(--button-hover);
  }

  @media (max-width: 900px) {
    .pane {
      height: auto;
    }

    .chat {
      max-height: 62dvh;
    }
  }
</style>
