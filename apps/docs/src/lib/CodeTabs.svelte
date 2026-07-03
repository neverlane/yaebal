<script lang="ts">
	import Code from "$lib/Code.svelte";

	export interface CodeTab {
		label: string;
		code: string;
		lang?: string;
		title?: string;
	}

	let { tabs, title = "commands", initial = 0 }: { tabs: CodeTab[]; title?: string; initial?: number } = $props();
	let active = $state(0);
	let appliedInitial = $state<number>();

	const current = $derived(tabs[active] ?? tabs[0]);

	$effect(() => {
		if (appliedInitial !== initial) {
			active = initial;
			appliedInitial = initial;
		}

		if (active >= tabs.length) active = Math.max(0, tabs.length - 1);
	});
</script>

{#if current}
	<div class="tabs">
		<div class="tablist" role="tablist" aria-label={title}>
			{#each tabs as tab, i (tab.label)}
				<button
					class="tab"
					class:active={i === active}
					role="tab"
					aria-selected={i === active}
					type="button"
					onclick={() => (active = i)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<Code code={current.code} lang={current.lang ?? "sh"} title={current.title ?? current.label} />
	</div>
{/if}

<style>
	.tabs {
		margin: 16px 0;
	}

	.tablist {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: -6px;
		padding-left: 10px;
		position: relative;
		z-index: 1;
	}

	.tab {
		padding: 6px 10px;
		border: 1px solid var(--code-stroke);
		border-radius: 10px 10px 0 0;
		background: var(--sidebar-bg);
		color: var(--gray);
		font-size: 12px;
		font-weight: 650;
		box-shadow: none;
		cursor: pointer;
	}

	.tab.active {
		background: var(--code-bg);
		color: var(--secondary);
		border-bottom-color: var(--code-bg);
	}

	.tabs :global(.code) {
		margin-top: 0;
	}
</style>
