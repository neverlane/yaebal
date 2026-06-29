<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { onMount, tick } from "svelte";

	interface Heading {
		id: string;
		text: string;
		level: number;
	}

	let headings = $state<Heading[]>([]);

	function slug(text: string): string {
		return text
			.toLowerCase()
			.trim()
			.replace(/[`'".()]/g, "")
			.replace(/[^a-z0-9а-яё]+/gi, "-")
			.replace(/^-|-$/g, "");
	}

	function collect() {
		const article = document.querySelector<HTMLElement>("[data-pagefind-body]");
		if (!article) return;

		const seen = new Map<string, number>();
		const next: Heading[] = [];

		for (const el of article.querySelectorAll<HTMLHeadingElement>("h2, h3")) {
			const text = el.textContent?.trim();
			if (!text) continue;

			let id = el.id || slug(text);

			const count = seen.get(id) ?? 0;
			seen.set(id, count + 1);

			if (count > 0) id = `${id}-${count + 1}`;

			el.id = id;
			next.push({ id, text, level: Number(el.tagName.slice(1)) });
		}

		headings = next;
	}

	async function refresh() {
		headings = [];
		await tick();
		collect();
	}

	onMount(() => {
		void refresh();
	});

	afterNavigate(() => {
		void refresh();
	});
</script>

{#if headings.length > 0}
	<nav class="toc" aria-label="on this page">
		<p class="title mono">on this page</p>
		{#each headings as h}
			<a class:sub={h.level === 3} href={`#${h.id}`}>{h.text}</a>
		{/each}
	</nav>
{/if}

<style>
	.toc {
		position: sticky;
		top: 28px;
		align-self: start;
		max-height: calc(100vh - 56px);
		overflow: auto;
		padding: 2px 0 2px 18px;
		border-left: 1px solid var(--content-border);
	}

	.title {
		margin: 0 0 10px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: var(--gray);
	}

	a {
		display: block;
		margin: 7px 0;
		font-size: 13px;
		line-height: 1.35;
		color: var(--gray);
	}

	a:hover {
		color: var(--secondary);
	}

	a.sub {
		padding-left: 12px;
		font-size: 12.5px;
	}
</style>
