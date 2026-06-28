<script lang="ts">
	import { onMount } from "svelte";

	type PagefindResult = {
		url: string;
		meta: { title?: string };
		excerpt: string;
	};

	type PagefindAPI = {
		search: (query: string) => Promise<{ results: Array<{ data: () => Promise<PagefindResult> }> }>;
	};

	let pagefind = $state<PagefindAPI | null>(null);
	let query = $state("");
	let results = $state<PagefindResult[]>([]);

	onMount(async () => {
		try {
			const pf = (await (new Function('path', 'return import(path)') as (p: string) => Promise<unknown>)("/pagefind/pagefind.js")) as PagefindAPI;
			pagefind = pf;
		} catch {
			// pagefind bundle not present (dev mode / prerender) — silent fallback
		}
	});

	async function onInput(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;
		query = value;

		if (!pagefind || !value.trim()) {
			results = [];
			return;
		}

		const res = await pagefind.search(value.trim());
		const loaded = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));

		results = loaded;
	}

	function clear() {
		query = "";
		results = [];
	}
</script>

<div class="search-wrap">
	<div class="box">
		<div class="input-row">
			<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<input
				class="input mono"
				type="search"
				placeholder="search docs…"
				value={query}
				oninput={onInput}
			/>
			{#if query}
				<button class="clear" onclick={clear} aria-label="clear search">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>

		{#if results.length > 0}
			<ul class="results">
				{#each results as result}
					<li>
						<a class="result-item" href={result.url} onclick={clear}>
							<span class="result-title">{result.meta.title ?? result.url}</span>
							<span class="result-excerpt">{@html result.excerpt}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if query.trim() && pagefind}
			<p class="no-results">no results for "{query}"</p>
		{/if}
	</div>
</div>

<style>
	.search-wrap {
		margin-bottom: 18px;
	}

	.search-wrap svg {
		display: block;
		flex: none;
		width: 14px;
		height: 14px;
	}

	.clear svg {
		width: 13px;
		height: 13px;
	}

	.clear {
		overflow: hidden;
	}

	.box {
		border: 1px solid var(--input-border);
		border-radius: 12px;
		overflow: hidden;
		background: var(--primary);
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 11px 6px 11px 12px;
	}

	.box:has(.results) .input-row,
	.box:has(.no-results) .input-row {
		border-bottom: 1px solid var(--sidebar-stroke);
	}

	.icon {
		flex: none;
		color: var(--gray);
	}

	.input {
		width: 100%;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		color: var(--secondary);
		font-size: 13px;
		font-weight: 500;
		box-shadow: none;
		padding: 0;
		border-radius: 0;
	}
	.input::placeholder {
		color: var(--gray);
	}

	.input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		color: var(--gray);
		border-radius: 6px;
		box-shadow: none;
		cursor: pointer;
	}

	@media (hover: hover) {
		.clear:hover {
			background: var(--button-hover);
			color: var(--secondary);
		}
	}

	.results {
		list-style: none;
		padding: 6px;
		margin: 0;
		max-height: 320px;
		overflow-y: auto;
	}

	.result-item {
		display: block;
		padding: 9px 10px;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: background 0.12s ease;
	}

	@media (hover: hover) {
		.result-item:hover {
			background: var(--button-hover);
		}
	}

	.result-title {
		display: block;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--secondary);
		margin-bottom: 3px;
	}

	.result-excerpt {
		display: block;
		font-size: 12px;
		color: var(--gray);
		line-height: 1.5;
	}

	.result-excerpt :global(mark) {
		background: transparent;
		color: var(--blue);
		font-weight: 600;
	}

	.no-results {
		padding: 12px 16px;
		font-size: 13px;
		color: var(--gray);
		margin: 0;
	}
</style>
