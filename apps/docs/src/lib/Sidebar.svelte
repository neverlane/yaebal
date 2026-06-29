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

	<Search onnavigate={onnavigate} />

	<nav class="nav" aria-label="documentation navigation">
		{#each nav as section}
			<div class="section">
				<span class="section-title mono">{section.title}</span>
				{#each section.items as item}
					<a
						class="item"
						class:active={isActive(item.href)}
						href={item.href}
						onclick={onnavigate}
						aria-current={isActive(item.href) ? "page" : undefined}
					>
						{item.label}
						{#if item.badge}<span class="badge">{item.badge}</span>{/if}
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<div class="bottom">
		<a class="ghlink" href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="open github repository">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
				<path d="M12 .5a12 12 0 0 0-3.8 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.45 11.45 0 0 1 12 5.8c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
			</svg>
			<span>github</span>
			<span class="sr"> opens in a new tab</span>
		</a>
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
		gap: 20px;
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
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 500;
		color: var(--gray);
	}

	.ghlink svg {
		flex: none;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (hover: hover) {
		.ghlink:hover {
			color: var(--secondary);
		}
	}
</style>
