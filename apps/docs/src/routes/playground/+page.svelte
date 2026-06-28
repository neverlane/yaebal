<script lang="ts">
	import { onMount } from "svelte";

	import { type ChatMessage, renderChat } from "@yaebal/preview";

	import { base } from "$app/paths";
	import { page } from "$app/stores";

	import MonacoEditor from "$lib/MonacoEditor.svelte";
	import { EXAMPLES } from "$lib/examples";

	import type { Step } from "$lib/playground";
	import { type LiveSession, type LogLine, runUserCode, startLive } from "$lib/playground-run";
	import {
		type Project,
		type Token,
		loadActiveToken,
		loadProjects,
		loadTokens,
		newProject,
		newToken,
		saveActiveToken,
		saveProjects,
		saveTokens,
	} from "$lib/playground-store";

	let projects = $state<Project[]>([]);
	let activeId = $state("");
	let code = $state("");

	let tokens = $state<Token[]>([]);
	let activeTokenId = $state("");
	let showTokens = $state(false);
	let newLabel = $state("");
	let newTok = $state("");

	let mode = $state<"mock" | "live">("mock");
	let steps = $state<Step[]>([]);
	let svg = $state("");
	let logs = $state<LogLine[]>([]);
	let error = $state("");
	let msg = $state("");
	let busy = $state(false);
	let copied = $state(false);

	let live = $state<LiveSession | null>(null);
	let liveMsgs = $state<ChatMessage[]>([]);

	const theme = "dark" as const;
	let chatBox = $state<HTMLDivElement>();

	let sideW = $state(216);
	let split = $state(0.5);
	let gridEl = $state<HTMLDivElement>();

	const chatW = () => Math.round(chatBox?.clientWidth || 360);

	function startResize(which: 1 | 2, e: PointerEvent) {
		e.preventDefault();

		const move = (ev: PointerEvent) => {
			const r = gridEl?.getBoundingClientRect();

			if (!r) return;
			if (which === 1) sideW = Math.max(150, Math.min(380, ev.clientX - r.left));
			else {
				const start = r.left + sideW + 14;
				const w = r.right - start;

				split = Math.max(0.22, Math.min(0.78, (ev.clientX - start) / w));
			}
		};

		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}

	const EMPTY = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hi"));

bot.start();`;

	onMount(() => {
		projects = loadProjects();
		tokens = loadTokens();
		activeTokenId = loadActiveToken();

		const exId = $page.url.searchParams.get("ex");
		const ex = (exId && EXAMPLES[exId]) || EXAMPLES["getting-started"];

		if (!projects.length && ex) {
			projects = [newProject(ex.title, ex.code)];
			saveProjects(projects);
		}

		const first = projects[0];
		activeId = first?.id ?? "";
		code = first?.code ?? ex?.code ?? "";

		const shared = $page.url.searchParams.get("code");
		if (shared) {
			try {
				code = new TextDecoder().decode(Uint8Array.from(atob(decodeURIComponent(shared)), (c) => c.charCodeAt(0)));
			} catch {
				/* malformed link — keep the example */
			}
		}

		steps = ex ? [...ex.steps] : [];
		runMock();
	});

	$effect(() => {
		const p = projects.find((x) => x.id === activeId);

		if (p && p.code !== code) {
			p.code = code;
			saveProjects(projects);
		}
	});

	async function runMock() {
		busy = true;

		const res = await runUserCode(code, steps, chatW(), theme);
		svg = res.svg;
		logs = res.logs;
		error = res.error ?? "";
		busy = false;
	}

	function renderLive() {
		svg = renderChat(liveMsgs, { theme, width: chatW() });
	}

	async function toggleLive() {
		if (live) {
			live.stop();
			live = null;
			logs = [...logs, { level: "log", text: "stopped." }];

			return;
		}

		const tok = tokens.find((t) => t.id === activeTokenId);
		if (!tok) {
			error = "select a bot token first";
			return;
		}

		error = "";
		liveMsgs = [];
		svg = "";
		logs = [];

		try {
			live = await startLive(
				code,
				tok.token,
				(m) => {
					liveMsgs = [...liveMsgs, m];
					renderLive();
				},
				(l) => {
					logs = [...logs, l];
				},
			);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function run() {
		if (mode === "mock") runMock();
		else toggleLive();
	}

	function send() {
		const t = msg.trim();
		if (!t || mode !== "mock") return;

		steps = [...steps, { user: t }];
		msg = "";

		runMock();
	}

	function addProject() {
		const p = newProject("untitled", EMPTY);
		projects = [...projects, p];

		saveProjects(projects);
		switchProject(p.id);
	}
	function switchProject(id: string) {
		const p = projects.find((x) => x.id === id);
		if (!p) return;

		activeId = id;
		code = p.code;

		if (mode === "mock") runMock();
	}
	function renameProject(p: Project) {
		const name = prompt("rename project", p.name);
		if (name) {
			p.name = name;
			saveProjects(projects);
		}
	}
	function deleteProject(id: string) {
		projects = projects.filter((p) => p.id !== id);
		saveProjects(projects);

		if (activeId === id) switchProject(projects[0]?.id ?? "");
	}

	function addToken() {
		if (!newTok.trim()) return;

		const t = newToken(newLabel.trim() || "bot", newTok.trim());
		tokens = [...tokens, t];
		saveTokens(tokens);

		activeTokenId = t.id;
		saveActiveToken(t.id);

		newLabel = "";
		newTok = "";
	}
	function removeToken(id: string) {
		tokens = tokens.filter((t) => t.id !== id);
		saveTokens(tokens);
	}
	function pickToken(id: string) {
		activeTokenId = id;
		saveActiveToken(id);
	}

	async function share() {
		const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(code)));
		const url = `${location.origin}${base}/playground?code=${encodeURIComponent(b64)}`;

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			/* clipboard blocked */
		}
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			run();
		}
	}
</script>

<svelte:head>
	<title>playground — yaebal</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="pg">
	<header class="top">
		<div class="brand">
			<a class="home" href="{base}/docs/getting-started" aria-label="back to docs">←</a>
			<span class="logo unbounded">yaebal</span>
			<span class="chip">playground</span>
		</div>
		<div class="top-r">
			<button class="share" onclick={share}>{copied ? "✓ link copied" : "⤴ share"}</button>
			<span class="hint mono">⌘↵ run</span>
		</div>
	</header>

	<div
		class="grid"
		bind:this={gridEl}
		style="--cols: {sideW}px 7px minmax(0, {split}fr) 7px minmax(0, {1 - split}fr);"
	>
		<aside class="side">
			<div class="side-h"><span>projects</span><button class="mini" onclick={addProject} aria-label="new project">＋</button></div>
			<ul class="projects">
				{#each projects as p (p.id)}
					<li class:active={p.id === activeId}>
						<button class="pname" onclick={() => switchProject(p.id)} ondblclick={() => renameProject(p)} title="double-click to rename">{p.name}</button>
						<button class="mini ghost" onclick={() => deleteProject(p.id)} aria-label="delete project">✕</button>
					</li>
				{/each}
			</ul>

			<div class="side-h"><span>bot token</span><button class="mini" onclick={() => (showTokens = !showTokens)} aria-label="manage tokens">⚙</button></div>
			<select class="tok-select mono" bind:value={activeTokenId} onchange={() => pickToken(activeTokenId)}>
				<option value="">— none · mock —</option>
				{#each tokens as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select>
			{#if showTokens}
				<div class="tok-manage">
					{#each tokens as t (t.id)}
						<div class="tok-row"><span class="mono">{t.label}</span><button class="mini ghost" onclick={() => removeToken(t.id)} aria-label="remove token">✕</button></div>
					{/each}
					<input class="ti mono" placeholder="label" bind:value={newLabel} />
					<input class="ti mono" placeholder="123456:ABC-token" bind:value={newTok} />
					<button class="add" onclick={addToken}>add token</button>
					<p class="note">stored only in this browser · sent only to telegram</p>
				</div>
			{/if}
		</aside>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="resizer" role="separator" aria-label="resize sidebar" onpointerdown={(e) => startResize(1, e)}></div>

		<section class="pane">
			<div class="bar">
				<div class="seg">
					<button class:on={mode === "mock"} onclick={() => (mode = "mock")}>mock</button>
					<button class:on={mode === "live"} onclick={() => (mode = "live")}>live</button>
				</div>
				<button class="run" class:danger={!!live} onclick={run} disabled={busy}>
					{#if mode === "live"}{live ? "■ Stop" : "▶ Start"}{:else}{busy ? "running…" : "▶ Run"}{/if}
				</button>
			</div>
			<div class="editor"><MonacoEditor bind:value={code} {theme} /></div>
		</section>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="resizer" role="separator" aria-label="resize panels" onpointerdown={(e) => startResize(2, e)}></div>

		<section class="pane">
			<div class="bar">
				<span class="label">result</span>
				{#if mode === "live" && live}<span class="dot">● live</span>{/if}
			</div>
			<div class="chat" bind:this={chatBox}>
				{#if error}
					<pre class="err mono">{error}</pre>
				{:else if svg}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="chat-svg">{@html svg}</div>
				{:else}
					<div class="empty">
						<span class="emoji">💬</span>
						<span class="mono">{mode === "live" ? "press Start, then message your bot" : "run to see the conversation"}</span>
					</div>
				{/if}
			</div>
			{#if mode === "mock"}
				<div class="composer">
					<input class="msg mono" placeholder="message the bot…" bind:value={msg} onkeydown={(e) => e.key === "Enter" && send()} />
					<button class="send" onclick={send} disabled={busy} aria-label="send message">↩</button>
				</div>
			{/if}
			<div class="console">
				<div class="console-bar">
					<div class="cbar-l">
						<span class="ctitle">Console</span>
						{#if logs.length}<span class="count mono">{logs.length}</span>{/if}
					</div>
					<button class="cclear mono" onclick={() => (logs = [])} disabled={!logs.length} aria-label="clear console">clear</button>
				</div>
				<div class="clog">
					{#if logs.length}
						{#each logs as l}
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
		</section>
	</div>
</div>

<style>
	.pg {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		color: var(--secondary);
		background: var(--primary);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
		flex: none;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 11px;
	}

	.home {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		color: var(--gray);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		transition: background 0.16s ease, color 0.16s ease;
	}

	.home:hover {
		color: var(--secondary);
		background: var(--button-hover);
	}

	.logo {
		font-size: 16px;
		font-weight: 600;
		color: var(--secondary);
	}

	.chip {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--gray);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		padding: 4px 10px;
		border-radius: 999px;
	}

	.top-r {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.share {
		font-size: 12px;
		font-weight: 500;
		padding: 6px 13px;
		border-radius: var(--border-radius);
		color: var(--button-text);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		transition: background 0.16s ease;
	}

	.share:hover {
		background: var(--button-hover);
	}

	.hint {
		font-size: 11px;
		color: var(--gray);
	}

	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--cols);
		gap: 0;
	}

	.resizer {
		cursor: col-resize;
		position: relative;
	}

	.resizer::after {
		content: "";
		position: absolute;
		inset: 0 3px;
		border-radius: 2px;
		transition: background 0.15s;
	}

	.resizer:hover::after {
		background: var(--content-border);
	}

	@media (max-width: 900px) {
		.pg {
			height: auto;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.resizer {
			display: none;
		}

		.side,
		.pane {
			height: auto;
		}

		.editor {
			min-height: 360px;
		}
	}

	.side,
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

	.side {
		padding: 10px;
		gap: 1px;
		overflow-y: auto;
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
	}

	.projects li {
		display: flex;
		align-items: center;
		border-radius: 9px;
		padding-left: 4px;
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
		padding: 7px 6px;
		font-size: 13px;
		color: var(--secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.projects li.active .pname {
		color: var(--primary);
		font-weight: 500;
	}

	.projects li.active .mini {
		color: var(--primary);
		opacity: 0.7;
	}

	.mini {
		width: 24px;
		height: 24px;
		padding: 0;
		font-size: 12px;
		background: transparent;
		box-shadow: none;
		color: var(--gray);
		border-radius: 7px;
		flex: none;
	}

	.mini:hover {
		color: var(--secondary);
		background: var(--button-hover);
	}

	.tok-select {
		width: 100%;
		padding: 8px 10px;
		border-radius: 9px;
		background: var(--button);
		color: var(--secondary);
		border: 1px solid var(--input-border);
		font-size: 12px;
		outline: none;
	}

	.tok-manage {
		padding: 8px 2px 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tok-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		padding-left: 4px;
		color: var(--secondary);
	}

	.ti {
		width: 100%;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--input-border);
		background: var(--button);
		color: var(--secondary);
		font-size: 12px;
		outline: none;
		transition: box-shadow 0.16s ease;
	}

	.ti:focus {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.add {
		font-size: 12px;
		padding: 7px;
		border-radius: 8px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		color: var(--button-text);
	}

	.add:hover {
		background: var(--button-hover);
	}

	.note {
		font-size: 10px;
		color: var(--gray);
		margin: 3px 2px 0;
		line-height: 1.45;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 8px 8px 14px;
		border-bottom: 1px solid var(--code-stroke);
		flex: none;
	}

	.label {
		font-size: 11px;
		color: var(--gray);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dot {
		font-size: 11px;
		color: var(--green);
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

	.editor {
		flex: 1;
		min-height: 0;
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

	.empty .emoji {
		font-size: 30px;
		opacity: 0.55;
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

	.console {
		flex: none;
		height: 168px;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--code-stroke);
		background: var(--primary);
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

	.cclear {
		font-size: 11px;
		padding: 3px 9px;
		border-radius: 7px;
		background: transparent;
		box-shadow: none;
		color: var(--gray);
	}

	.cclear:hover:not(:disabled) {
		background: var(--button);
		color: var(--secondary);
	}

	.cclear:disabled {
		opacity: 0.4;
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
</style>
