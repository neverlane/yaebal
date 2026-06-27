<script lang="ts">
	import Sidebar from "$lib/Sidebar.svelte";

	let { children } = $props();
	let menuOpen = $state(false);
</script>

<div class="shell">
	<div class="mobilebar">
		<a class="brand unbounded" href="/">yaebal</a>
		<button class="menu" onclick={() => (menuOpen = !menuOpen)} aria-label="toggle menu">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				{#if menuOpen}
					<path d="M18 6 6 18M6 6l12 12" />
				{:else}
					<path d="M3 12h18M3 6h18M3 18h18" />
				{/if}
			</svg>
		</button>
	</div>

	<div class="sidebar-wrap" class:open={menuOpen}>
		<Sidebar onnavigate={() => (menuOpen = false)} />
	</div>

	{#if menuOpen}
		<button class="backdrop" onclick={() => (menuOpen = false)} aria-label="close menu"></button>
	{/if}

	<main class="content">
		<article class="prose" data-pagefind-body>
			{@render children()}
		</article>
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
	}

	.sidebar-wrap {
		position: fixed;
		top: 0;
		left: 0;
		height: 100vh;
		z-index: 30;
	}

	.content {
		margin-left: var(--sidebar-width);
		padding: 56px 40px 120px;
	}

	.prose {
		max-width: var(--content-width);
		margin: 0 auto;
	}

	.mobilebar {
		display: none;
	}

	.backdrop {
		display: none;
	}

	@media (max-width: 880px) {
		.mobilebar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			position: sticky;
			top: 0;
			z-index: 20;
			padding: 12px 18px;
			background: var(--primary);
			border-bottom: 1px solid var(--content-border);
		}
		.mobilebar .brand {
			font-size: 17px;
			font-weight: 700;
		}
		.menu {
			width: 38px;
			height: 38px;
			padding: 0;
			background: transparent;
			box-shadow: none;
			color: var(--secondary);
		}

		.sidebar-wrap {
			transform: translateX(-100%);
			transition: transform 0.22s ease;
			box-shadow: 0 0 0 100vmax transparent;
		}
		.sidebar-wrap.open {
			transform: translateX(0);
		}

		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 25;
			background: rgba(0, 0, 0, 0.4);
			border: none;
			border-radius: 0;
			box-shadow: none;
		}

		.content {
			margin-left: 0;
			padding: 28px 20px 100px;
		}
	}

	/* prose */
	.prose :global(h1) {
		margin-bottom: 10px;
	}
	.prose :global(.lead) {
		font-size: 16.5px;
		color: var(--gray);
		line-height: 1.6;
		margin-bottom: 8px;
	}
	.prose :global(h2) {
		margin-top: 44px;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--content-border);
	}
	.prose :global(h3) {
		margin-top: 30px;
		margin-bottom: 8px;
	}
	.prose :global(p) {
		margin: 14px 0;
		line-height: 1.7;
	}
	.prose :global(ul),
	.prose :global(ol) {
		margin: 14px 0;
		padding-left: 22px;
		line-height: 1.8;
	}
	.prose :global(li) {
		margin: 4px 0;
	}
	.prose :global(a) {
		color: var(--blue);
		font-weight: 500;
	}
	.prose :global(a:hover) {
		text-decoration: underline;
	}
	.prose :global(strong) {
		font-weight: 600;
	}
	.prose :global(code:not(pre code)) {
		font-family: "IBM Plex Mono", monospace;
		font-size: 0.86em;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--code-bg);
		border: 1px solid var(--code-stroke);
	}
	.prose :global(hr) {
		border: none;
		border-top: 1px solid var(--content-border);
		margin: 36px 0;
	}
	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 18px 0;
		font-size: 14px;
	}
	.prose :global(th),
	.prose :global(td) {
		text-align: left;
		padding: 9px 12px;
		border-bottom: 1px solid var(--content-border);
		vertical-align: top;
	}
	.prose :global(th) {
		font-weight: 600;
		color: var(--gray);
		font-size: 12.5px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.prose :global(.note) {
		margin: 18px 0;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--content-border);
		border-left: 3px solid var(--blue);
		background: var(--sidebar-bg);
		font-size: 14px;
		line-height: 1.6;
	}
</style>
