<script lang="ts">
  import Dialog from "$lib/ui/Dialog.svelte";
  import type { PlaygroundSession } from "./session.svelte";

  let { session }: { session: PlaygroundSession } = $props();
</script>

<Dialog
  open={session.showSettings}
  onclose={() => (session.showSettings = false)}
  label="playground settings"
>
  <div class="settings-head">
    <div>
      <div class="settings-title">settings</div>
      <div class="settings-sub mono">live bot, api root, proxy/cors</div>
    </div>
    <button class="mini ghost" onclick={() => (session.showSettings = false)} aria-label="close settings">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  </div>

  <div class="settings-grid">
    <div class="setting-card">
      <div class="setting-row-head">
        <span>saved bots</span>
        <button class="cclear mono" onclick={() => session.removeAllTokens()} disabled={!session.tokens.length}>clear all</button>
      </div>
      <div class="token-list">
        <button class="bot-option" class:selected={!session.activeTokenId} onclick={() => session.pickToken("")}>
          <span class="bot-option-main mono">mock mode</span>
          <span class="bot-option-state">{!session.activeTokenId ? "enabled" : "select"}</span>
        </button>
        {#each session.tokens as t (t.id)}
          <div class="bot-option-row">
            <button class="bot-option" class:selected={session.activeTokenId === t.id} onclick={() => session.pickToken(t.id)}>
              <span class="bot-option-main mono">{t.label}</span>
              <span class="bot-option-state">{session.activeTokenId === t.id ? "enabled" : "select"}</span>
            </button>
            <button class="mini ghost" onclick={() => session.removeToken(t.id)} aria-label="remove token">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        {/each}
      </div>
    </div>

    <label class="setting-field">
      <span>bot label</span>
      <input class="ti mono" placeholder="production bot" bind:value={session.newLabel} />
    </label>
    <label class="setting-field">
      <span>bot token</span>
      <input class="ti mono" type="password" placeholder="123456:ABC-token" bind:value={session.newTok} />
    </label>
    <button class="add setting-wide" onclick={() => session.addToken()}>add bot token</button>

    <label class="setting-field setting-wide">
      <span>Telegram API root</span>
      <input class="ti mono" placeholder="https://api.telegram.org" bind:value={session.apiRoot} />
    </label>
    <label class="setting-field setting-wide">
      <span>proxy / cors bridge</span>
      <input class="ti mono" placeholder="https://your-proxy.example/bot-api" bind:value={session.proxyUrl} />
    </label>
    <label class="toggle-row setting-wide">
      <input class="check-input" type="checkbox" bind:checked={session.corsProxy} />
      <span class="check-box" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span>route live Bot API calls through proxy/cors bridge when possible</span>
    </label>
  </div>
  <p class="note settings-note">Tokens are stored in sessionStorage for this tab. API/proxy settings stay in localStorage. Live code still runs locally in the browser.</p>
</Dialog>

<style>
  .settings-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--code-stroke);
  }

  .settings-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .settings-sub {
    margin-top: 4px;
    font-size: 11px;
    color: var(--gray);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding-top: 14px;
  }

  .setting-field,
  .setting-card,
  .toggle-row {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 11px;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .setting-card {
    grid-row: span 3;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--input-border);
    background: var(--button);
  }

  .setting-row-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .setting-wide {
    grid-column: 1 / -1;
  }

  .token-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-transform: none;
    letter-spacing: 0;
  }

  .bot-option-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    align-items: center;
  }

  .bot-option {
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.12);
    box-shadow: none;
    color: var(--secondary);
    text-align: left;
  }

  .bot-option:hover {
    background: rgba(127, 127, 127, 0.2);
  }

  .bot-option.selected {
    background: var(--secondary);
    color: var(--primary);
  }

  .bot-option-main {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .bot-option-state {
    flex: none;
    font-size: 10px;
    color: currentColor;
    opacity: 0.65;
  }

  .toggle-row {
    position: relative;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    text-transform: none;
    letter-spacing: 0;
    line-height: 1.35;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--input-border);
    background: var(--button);
    cursor: pointer;
  }

  .check-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .check-box {
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    border: 1px solid var(--input-border);
    background: var(--primary);
    color: var(--primary);
  }

  .check-box svg {
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.12s ease, transform 0.12s ease;
  }

  .check-input:checked + .check-box {
    border-color: var(--secondary);
    background: var(--secondary);
  }

  .check-input:checked + .check-box svg {
    opacity: 1;
    transform: scale(1);
  }

  .check-input:focus-visible + .check-box {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }

  .settings-note {
    margin-top: 12px;
  }

  @media (max-width: 900px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .setting-card,
    .setting-wide {
      grid-column: auto;
      grid-row: auto;
    }
  }
</style>
