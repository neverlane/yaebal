<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { base } from "$app/paths";
	import { page } from "$app/stores";
	import { onMount, untrack } from "svelte";

	import Menu from "$lib/ui/Menu.svelte";

	import ConsolePane from "./ConsolePane.svelte";
	import EditorPane from "./EditorPane.svelte";
	import ResultPane from "./ResultPane.svelte";
	import SettingsDialog from "./SettingsDialog.svelte";
	import SidePanel from "./SidePanel.svelte";
	import StatePane from "./StatePane.svelte";
	import WindowFrame from "./WindowFrame.svelte";
	import WindowMenu from "./WindowMenu.svelte";
	import { PG_KEYS, PG_MIN, type PresetKind, canSwapGroups, initialTree, presetTree } from "./keys";
	import { PlaygroundSession } from "./session.svelte";
	import { WindowManager } from "./window-manager.svelte";

	import "./atoms.css";

	const session = new PlaygroundSession();
	const wm = new WindowManager({
		keys: PG_KEYS,
		min: PG_MIN,
		initialTree,
		storageKey: "yaebal.pg.layout",
		canSwapGroups,
	});

	let layoutMenuOpen = $state(false);
	let autoRunTimer: ReturnType<typeof setTimeout> | undefined;

	function applyPreset(kind: PresetKind) {
		wm.setTree(presetTree(kind));
		layoutMenuOpen = false;
	}

	function closeMenus() {
		wm.closeMenu();
		layoutMenuOpen = false;
	}

	onMount(() => {
		wm.load();
		session.init($page.url);

		requestAnimationFrame(() => {
			wm.layoutWindows();
			session.runMock();
		});
		window.addEventListener("resize", wm.onViewportResize);

		return () => window.removeEventListener("resize", wm.onViewportResize);
	});

	afterNavigate(() => {
		if (!wm.ready) return;
		session.importExampleFromUrl($page.url, true);
	});

	$effect(() => {
		session.syncActiveProject();
	});

	$effect(() => {
		if (session.settingsReady && typeof localStorage !== "undefined") session.saveSettings();
	});

	$effect(() => {
		if (wm.ready && typeof localStorage !== "undefined") wm.save();
	});

	// debounced auto-run: only `code` is tracked — runs the mock again shortly after
	// the user stops typing. runMock stamps lastRunCode, so runs triggered elsewhere
	// (send, apply state, project switch) don't double-fire here.
	$effect(() => {
		const current = session.code;

		untrack(() => {
			if (!session.settingsReady || !session.autoRun || session.mode !== "mock") return;
			if (current === session.lastRunCode) return;

			clearTimeout(autoRunTimer);
			autoRunTimer = setTimeout(() => {
				if (session.autoRun && session.mode === "mock") session.runMock();
			}, 700);
		});
	});

	function isEditingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return Boolean(target.closest("input,textarea,select,[contenteditable='true'],.monaco-editor,.editor"));
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			session.run();
		}

		if (isEditingTarget(e.target)) return;

		if (e.altKey && e.key === "Enter") {
			e.preventDefault();
			if (wm.active) wm.toggleMaximize(wm.active);
		}

		if (e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
			e.preventDefault();
			const dir = e.key === "ArrowLeft" ? "w" : e.key === "ArrowRight" ? "e" : e.key === "ArrowUp" ? "n" : "s";
			wm.keyboardMove(dir, e.shiftKey);
		}

		if (e.key === "Escape") closeMenus();
	}

	function goBack(e: MouseEvent) {
		if (typeof window !== "undefined" && window.history.length > 1) {
			e.preventDefault();
			window.history.back();
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
			<a class="home" href="{base}/docs/getting-started" aria-label="back to docs" onclick={goBack}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m15 18-6-6 6-6" />
				</svg>
			</a>
			<span class="logo unbounded">yaebal</span>
			<span class="chip">playground</span>
		</div>
		<div class="top-r">
			<span class="bot-pill mono">bot: {session.activeTokenLabel}</span>
			<div class="layout-picker">
				<button class="share" onclick={() => (layoutMenuOpen = !layoutMenuOpen)} title="layout presets">
					<span>layout</span>
				</button>
				<Menu
					open={layoutMenuOpen}
					onclose={() => (layoutMenuOpen = false)}
					origin="top right"
					style="position: absolute; right: 0; top: calc(100% + 8px);"
					label="layout presets"
				>
					<button onclick={() => applyPreset("default")}>default</button>
					<button onclick={() => applyPreset("editor")}>editor focus</button>
					<button onclick={() => applyPreset("preview")}>preview focus</button>
					<button onclick={() => applyPreset("debug")}>debug</button>
				</Menu>
			</div>
			<button class="share" onclick={() => (session.showSettings = true)} title="playground settings">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
				<span>settings</span>
			</button>
			<button class="share" onclick={() => session.share()}>
				{#if session.copied}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
					<span>link copied</span>
				{:else}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
					<span>share</span>
				{/if}
			</button>
			<span class="hint mono">⌘↵ run</span>
		</div>
	</header>

	<div class="grid" bind:this={wm.gridEl}>
		<WindowFrame {wm} key="side" label="projects window">
			<SidePanel {session} {wm} />
		</WindowFrame>

		<WindowFrame {wm} key="editor" label="editor window">
			<EditorPane {session} {wm} />
		</WindowFrame>

		<WindowFrame {wm} key="result" label="result window">
			<ResultPane {session} {wm} />
		</WindowFrame>

		<WindowFrame {wm} key="state" label="mock state window">
			<StatePane {session} {wm} />
		</WindowFrame>

		<WindowFrame {wm} key="console" label="console window">
			<ConsolePane {session} {wm} />
		</WindowFrame>

		{#if wm.ghost}
			<div class="layout-ghost" style={`left:${wm.ghost.x}px;top:${wm.ghost.y}px;width:${wm.ghost.w}px;height:${wm.ghost.h}px;`}></div>
		{/if}
	</div>

	<WindowMenu {wm} />
	<SettingsDialog {session} />
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
		/* the whole playground reads as a code tool — use the site mono font */
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}

	.pg :global(input),
	.pg :global(select),
	.pg :global(button),
	.pg :global(textarea) {
		font-family: inherit;
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

	.bot-pill {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		color: var(--gray);
		padding: 5px 9px;
		border-radius: 999px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
	}

	.grid {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.layout-ghost {
		position: absolute;
		z-index: 9999;
		border: 2px dashed var(--blue);
		border-radius: 16px;
		background: rgba(0, 122, 255, 0.08);
		box-shadow: 0 0 0 1px rgba(0, 122, 255, 0.18), 0 18px 48px rgba(0, 122, 255, 0.16);
		pointer-events: none;
		transition:
			left 0.08s ease,
			top 0.08s ease,
			width 0.08s ease,
			height 0.08s ease;
	}

	.layout-picker {
		position: relative;
	}

	@media (max-width: 900px) {
		.pg {
			height: auto;
			min-height: 100dvh;
		}

		.grid {
			display: flex;
			flex-direction: column;
			gap: 10px;
			overflow: visible;
		}
	}
</style>
