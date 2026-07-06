<script lang="ts">
	import { getHighlighter, langOf } from "./highlight";

	let {
		code,
		title = "",
		lang = "ts",
		onTry,
		running = false,
	}: {
		code: string;
		title?: string;
		lang?: string;
		onTry?: () => void;
		running?: boolean;
	} = $props();

	let html = $state("");
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	$effect(() => {
		const source = code.trim();
		const language = langOf(lang);
		let cancelled = false;

		html = "";

		void (async () => {
			try {
				const hl = await getHighlighter();

				if (cancelled) return;

				html = hl.codeToHtml(source, {
					lang: language,
					themes: { light: "github-light", dark: "github-dark" },
					defaultColor: false,
				});
			} catch {
				if (cancelled) return;

				html = "";
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(code.trim());

			copied = true;
			clearTimeout(timer);

			timer = setTimeout(() => (copied = false), 1400);
		} catch {
			copied = false;
		}
	}
</script>

<div class="code">
	<div class="bar">
		<span class="title mono">{title || lang}</span>
		<div class="actions">
			{#if onTry}
				<button class="try-btn" onclick={onTry} disabled={running} aria-label="run example">
					{#if running}
						running…
					{:else}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
						try it
					{/if}
				</button>
			{/if}
			<button class="copy" onclick={copy} aria-label="copy code">
				{copied ? "copied" : "copy"}
			</button>
		</div>
	</div>
	{#if html}
		<div class="hl">{@html html}</div>
	{:else}
		<pre class="mono"><code>{code.trim()}</code></pre>
	{/if}
</div>

<style>
	.code {
		position: relative;
		z-index: 1;
		border: 1px solid var(--code-stroke);
		background: var(--code-bg);
		border-radius: 14px;
		overflow: hidden;
		margin: 18px 0;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 7px 8px 7px 14px;
		border-bottom: 1px solid var(--code-stroke);
	}

	.title {
		font-size: 11.5px;
		color: var(--gray);
		text-transform: lowercase;
		letter-spacing: 0.2px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.try-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 11px;
		font-size: 11.5px;
		font-weight: 600;
		border-radius: 9px;
		background: var(--secondary);
		color: var(--primary);
		box-shadow: none;
		cursor: pointer;
	}
	.try-btn svg {
		display: block;
	}
	.try-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.copy {
		padding: 4px 10px;
		font-size: 11.5px;
		border-radius: 9px;
		background: transparent;
		box-shadow: none;
		color: var(--gray);
	}

	@media (hover: hover) {
		.copy:hover {
			background: var(--button-hover);
			color: var(--button-text);
		}
	}

	pre,
	.hl :global(pre) {
		margin: 0;
		padding: 16px 18px;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.7;
		tab-size: 2;
		background: transparent !important;
	}

	/* force the docs mono font onto our fallback AND shiki's injected pre/code/spans */
	pre,
	code,
	.hl :global(pre),
	.hl :global(code),
	.hl :global(.shiki),
	.hl :global(.shiki span) {
		font-family: "JetBrains Mono", monospace !important;
		font-variant-ligatures: none;
	}

	code,
	.hl :global(code) {
		white-space: pre;
	}

	/* shiki dual-theme: light colors by default, swap to dark vars under [data-theme="dark"] */
	.hl :global(.shiki),
	.hl :global(.shiki span) {
		color: var(--shiki-light);
	}

	:global([data-theme="dark"]) .hl :global(.shiki),
	:global([data-theme="dark"]) .hl :global(.shiki span) {
		color: var(--shiki-dark);
	}
</style>
