<script lang="ts">
	import { page } from "$app/stores";
	import Sidebar from "$lib/Sidebar.svelte";
	import Toc from "$lib/Toc.svelte";
	import { GITHUB, docsSourcePath, navNeighbors } from "$lib/nav";

	let { children } = $props();
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();

	const neighbors = $derived(navNeighbors($page.url.pathname));
	const sourcePath = $derived(docsSourcePath($page.url.pathname));
	const editUrl = $derived(sourcePath ? `${GITHUB}/edit/master/${sourcePath}` : undefined);

	function closeMenu() {
		menuOpen = false;
		menuButton?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape" && menuOpen) closeMenu();
	}

	$effect(() => {
		if (typeof document === "undefined") return;
		document.body.style.overflow = menuOpen ? "hidden" : "";
	});
</script>

<svelte:window onkeydown={onKeydown} />

<a class="skip" href="#main-content">skip to content</a>

<div class="shell">
	<div class="mobilebar">
		<a class="brand unbounded" href="/">yaebal</a>
		<button
			bind:this={menuButton}
			class="menu"
			onclick={() => (menuOpen = !menuOpen)}
			aria-label={menuOpen ? "close navigation menu" : "open navigation menu"}
			aria-expanded={menuOpen}
			aria-controls="docs-sidebar"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				{#if menuOpen}
					<path d="M18 6 6 18M6 6l12 12" />
				{:else}
					<path d="M3 12h18M3 6h18M3 18h18" />
				{/if}
			</svg>
		</button>
	</div>

	<div id="docs-sidebar" class="sidebar-wrap" class:open={menuOpen} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? "true" : undefined}>
		<Sidebar onnavigate={closeMenu} />
	</div>

	{#if menuOpen}
		<button class="backdrop" onclick={closeMenu} aria-label="close navigation menu"></button>
	{/if}

	<main id="main-content" class="content">
		<div class="doc-grid">
			<article class="prose" data-pagefind-body>
				{@render children()}

				<footer class="doc-footer">
					{#if editUrl}
						<a class="edit" href={editUrl} target="_blank" rel="noopener noreferrer" aria-label="edit this page on github">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M12 20h9" />
								<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
							</svg>
							<span>edit this page</span>
						</a>
					{/if}

					<div class="pager" aria-label="page navigation">
						{#if neighbors.previous}
							<a class="page-card prev" href={neighbors.previous.href}>
								<span>previous</span>
								<strong>← {neighbors.previous.label}</strong>
							</a>
						{/if}
						{#if neighbors.next}
							<a class="page-card next" href={neighbors.next.href}>
								<span>next</span>
								<strong>{neighbors.next.label} →</strong>
							</a>
						{/if}
					</div>
				</footer>
			</article>

			<aside class="toc-wrap" aria-label="table of contents">
				<Toc />
			</aside>
		</div>
	</main>
</div>

<style>
	.skip {
		position: fixed;
		top: 10px;
		left: 10px;
		z-index: 100;
		transform: translateY(-160%);
		padding: 9px 12px;
		border-radius: 10px;
		background: var(--secondary);
		color: var(--primary);
		font-weight: 600;
	}

	.skip:focus {
		transform: translateY(0);
	}

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

	.doc-grid {
		display: grid;
		grid-template-columns: minmax(0, var(--content-width)) 220px;
		gap: 44px;
		max-width: calc(var(--content-width) + 264px);
		margin: 0 auto;
	}

	.prose {
		min-width: 0;
	}

	.mobilebar,
	.backdrop {
		display: none;
	}

	.doc-footer {
		margin-top: 56px;
		padding-top: 24px;
		border-top: 1px solid var(--content-border);
	}

	.edit {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 18px;
		padding: 7px 10px;
		border: 1px solid var(--content-border);
		border-radius: 10px;
		background: var(--sidebar-bg);
		font-size: 13px;
		color: var(--gray);
		text-decoration: none;
	}

	.edit:hover {
		color: var(--secondary);
		border-color: var(--blue);
		text-decoration: none;
	}

	.edit svg {
		flex: none;
	}

	.pager {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.page-card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
		border: 1px solid var(--content-border);
		border-radius: 14px;
		background: var(--sidebar-bg);
		text-decoration: none;
	}

	.page-card span {
		font-size: 11px;
		letter-spacing: 0.7px;
		color: var(--gray);
	}

	.page-card span,
	.page-card strong {
		text-decoration: none;
	}

	.page-card strong {
		font-size: 14px;
		color: var(--secondary);
	}

	.page-card.next {
		text-align: right;
		grid-column: 2;
	}

	@media (hover: hover) {
		.page-card:hover {
			border-color: var(--blue);
			text-decoration: none;
		}
	}

	@media (max-width: 1120px) {
		.doc-grid {
			grid-template-columns: minmax(0, var(--content-width));
		}

		.toc-wrap {
			display: none;
		}
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

		.pager {
			grid-template-columns: 1fr;
		}

		.page-card.next {
			grid-column: auto;
			text-align: left;
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
	.prose :global(:where(h1, h2, h3, p, li, th, td, .lead, .note)) {
		text-transform: lowercase;
	}
	.prose :global(:where(code, pre, .code, .code *)) {
		text-transform: none;
	}
	.prose :global(h2) {
		margin-top: 44px;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--content-border);
		scroll-margin-top: 22px;
	}
	.prose :global(h3) {
		margin-top: 30px;
		margin-bottom: 8px;
		scroll-margin-top: 22px;
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
	.prose :global(.page-card:hover),
	.prose :global(.page-card:hover span),
	.prose :global(.page-card:hover strong),
	.prose :global(.edit:hover) {
		text-decoration: none;
	}
	.prose :global(strong) {
		font-weight: 600;
	}
	.prose :global(code:not(pre code)) {
		font-family: "JetBrains Mono", monospace;
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
		display: block;
		width: 100%;
		overflow-x: auto;
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
