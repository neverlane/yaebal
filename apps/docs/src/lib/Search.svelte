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

	let { onnavigate }: { onnavigate?: () => void } = $props();

	let pagefind = $state<PagefindAPI | null>(null);
	let query = $state("");
	let results = $state<PagefindResult[]>([]);
	let loading = $state(false);
	let ready = $state(false);
	let failed = $state(false);
	let open = $state(false);
	let active = $state(-1);
	let input = $state<HTMLInputElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	onMount(async () => {
		try {
			const pf = (await (new Function("path", "return import(path)") as (
				p: string,
			) => Promise<unknown>)("/pagefind/pagefind.js")) as PagefindAPI;
			pagefind = pf;
			ready = true;
		} catch {
			failed = true;
		}
	});

	function schedule(value: string) {
		query = value;
		open = Boolean(value.trim());
		active = -1;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void search(value), 180);
	}

	async function search(value: string) {
		const q = value.trim();
		const id = ++seq;

		if (!pagefind || !q) {
			results = [];
			loading = false;
			return;
		}

		loading = true;
		try {
			const res = await pagefind.search(q);
			const loaded = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
			
			if (id === seq) results = loaded;
		} catch {
			if (id === seq) results = [];
		} finally {
			if (id === seq) loading = false;
		}
	}

	function clear() {
		query = "";
		results = [];
		open = false;
		active = -1;
		input?.focus();
	}

	function choose(url?: string) {
		if (!url) return;

		clear();
		onnavigate?.();

		location.href = url;
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === "Escape") {
			event.preventDefault();
			clear();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			active = Math.min(results.length - 1, active + 1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			active = Math.max(-1, active - 1);
		} else if (event.key === "Enter" && active >= 0) {
			event.preventDefault();
			choose(results[active]?.url);
		}
	}
</script>

<div class="search-wrap">
	<div class="box" class:open>
		<div class="input-row">
			<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<input
				bind:this={input}
				class="input mono"
				type="search"
				placeholder="search docs…"
				aria-label="Search documentation"
				role="combobox"
				aria-expanded={open}
				aria-controls="search-results"
				aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined}
				value={query}
				oninput={(e) => schedule((e.currentTarget as HTMLInputElement).value)}
				onkeydown={onKeydown}
			/>
			{#if loading}<span class="spin" aria-label="searching"></span>{/if}
			{#if query}
				<button class="clear" onclick={clear} aria-label="Clear search">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>

		<div class="status" aria-live="polite">
			{#if loading}searching…{:else if query.trim() && results.length}{results.length} results{/if}
		</div>

		{#if open && results.length > 0}
			<ul id="search-results" class="results" role="listbox">
				{#each results as result, i}
					<li role="presentation">
						<a
							id={`search-result-${i}`}
							class="result-item"
							class:active={i === active}
							href={result.url}
							role="option"
							aria-selected={i === active}
							onclick={() => {
								clear();
								onnavigate?.();
							}}
							onmouseenter={() => (active = i)}
						>
							<span class="result-title">{result.meta.title ?? result.url}</span>
							<span class="result-excerpt">{@html result.excerpt}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if open && query.trim() && !loading && ready}
			<p class="no-results">no results for “{query}”</p>
		{:else if open && failed}
			<p class="no-results">search index is not available in dev mode</p>
		{/if}
	</div>
</div>

<style>
	.search-wrap {
		margin-bottom: 18px;
	}

	.box {
		border: 1px solid var(--input-border);
		border-radius: 12px;
		overflow: hidden;
		background: var(--primary);
	}

	.box:focus-within {
		border-color: var(--blue);
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 11px 6px 11px 12px;
	}

	.box.open .input-row {
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

	.spin {
		width: 13px;
		height: 13px;
		border: 2px solid var(--content-border);
		border-top-color: var(--blue);
		border-radius: 999px;
		animation: spin 0.7s linear infinite;
	}

	.status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.results {
		list-style: none;
		padding: 6px;
		margin: 0;
		max-height: 330px;
		overflow-y: auto;
	}

	.result-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 9px 10px;
		border-radius: 9px;
		color: var(--gray);
	}

	.result-item:hover,
	.result-item.active {
		background: var(--button-hover);
		color: var(--secondary);
		text-decoration: none;
	}

	.result-title {
		font-size: 13px;
		font-weight: 650;
		color: var(--secondary);
	}

	.result-excerpt {
		font-size: 12px;
		line-height: 1.45;
	}

	.result-excerpt :global(mark) {
		background: transparent;
		color: var(--blue);
		font-weight: 700;
	}

	.no-results {
		margin: 0;
		padding: 11px 12px;
		font-size: 12.5px;
		color: var(--gray);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
