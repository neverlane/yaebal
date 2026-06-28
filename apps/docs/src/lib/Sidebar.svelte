<script lang="ts">
	import { page } from "$app/stores";
	import { nav, GITHUB } from "./nav";
	
	import ThemeToggle from "./ThemeToggle.svelte";
	import Search from "./Search.svelte";

	let { onnavigate }: { onnavigate?: () => void } = $props();

	function isActive(href: string): boolean {
		return $page.url.pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
	}
</script>

<aside class="sidebar">
	<a class="brand unbounded" href="/" onclick={onnavigate}>yaebal</a>

	<Search />

	<nav class="nav">
		{#each nav as section}
			<div class="section">
				<span class="section-title mono">{section.title}</span>
				{#each section.items as item}
					<a
						class="item"
						class:active={isActive(item.href)}
						href={item.href}
						onclick={onnavigate}
					>
						{item.label}
						{#if item.badge}<span class="badge">{item.badge}</span>{/if}
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<div class="bottom">
		<a class="ghlink" href={GITHUB} target="_blank" rel="noreferrer">github ↗</a>
		<ThemeToggle />
	</div>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: var(--sidebar-width);
		padding: 22px 16px;
		background: var(--sidebar-bg);
		border-right: 1px solid var(--sidebar-stroke);
		overflow: hidden;
	}

	.brand {
		flex: none;
		font-size: 19px;
		font-weight: 700;
		padding: 0 8px;
		margin-bottom: 28px;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 22px;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin-right: -8px;
		padding-right: 8px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: var(--gray);
		padding: 0 5px;
		margin-bottom: 6px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 500;
		color: var(--gray);
		transition: background 0.16s ease, color 0.16s ease;
	}

	@media (hover: hover) {
		.item:hover {
			background: var(--button-hover);
			color: var(--secondary);
		}
	}

	.item.active {
		background: var(--secondary);
		color: var(--primary);
	}

	.badge {
		font-size: 9.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--blue);
		color: var(--white);
	}

	.item.active .badge {
		background: var(--primary);
		color: var(--secondary);
	}

	.bottom {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 8px 0;
		margin-top: 16px;
		border-top: 1px solid var(--sidebar-stroke);
	}

	.ghlink {
		font-size: 13px;
		font-weight: 500;
		color: var(--gray);
	}

	@media (hover: hover) {
		.ghlink:hover {
			color: var(--secondary);
		}
	}
</style>
