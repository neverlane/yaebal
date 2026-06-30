<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { onMount, tick } from "svelte";

	interface Heading {
		id: string;
		text: string;
		level: number;
	}

	let headings = $state<Heading[]>([]);
	let activeId = $state("");
	let headingElements: HTMLHeadingElement[] = [];
	let frame = 0;

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
		if (!article) {
			headings = [];
			headingElements = [];
			activeId = "";
			return;
		}

		const seen = new Map<string, number>();
		const next: Heading[] = [];
		const elements: HTMLHeadingElement[] = [];

		for (const el of article.querySelectorAll<HTMLHeadingElement>("h2, h3")) {
			const text = el.textContent?.trim();
			if (!text) continue;

			let id = el.id || slug(text);

			const count = seen.get(id) ?? 0;
			seen.set(id, count + 1);

			if (count > 0) id = `${id}-${count + 1}`;

			el.id = id;
			elements.push(el);
			next.push({ id, text, level: Number(el.tagName.slice(1)) });
		}

		headingElements = elements;
		headings = next;
		updateActive();
	}

	function updateActive() {
		let next = "";

		for (const el of headingElements) {
			if (el.getBoundingClientRect().top > 48) break;
			next = el.id;
		}

		activeId = next;
	}

	function scheduleActiveUpdate() {
		if (frame) return;

		frame = requestAnimationFrame(() => {
			frame = 0;
			updateActive();
		});
	}

	async function refresh() {
		headings = [];
		headingElements = [];
		activeId = "";
		await tick();
		collect();
		scheduleActiveUpdate();
	}

	onMount(() => {
		void refresh();
		window.addEventListener("scroll", scheduleActiveUpdate, { passive: true });
		window.addEventListener("resize", scheduleActiveUpdate);

		return () => {
			window.removeEventListener("scroll", scheduleActiveUpdate);
			window.removeEventListener("resize", scheduleActiveUpdate);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	afterNavigate(() => {
		void refresh();
	});
</script>

{#if headings.length > 0}
	<nav class="toc" aria-label="on this page">
		<p class="title mono">on this page</p>
		{#each headings as h}
			<a
				class:active={activeId === h.id}
				class:sub={h.level === 3}
				href={`#${h.id}`}
				aria-current={activeId === h.id ? "location" : undefined}
			>
				{h.text}
			</a>
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
		position: relative;
		margin: 7px 0;
		font-size: 13px;
		line-height: 1.35;
		color: var(--gray);
		transition: color 0.18s ease;
	}

	a::before {
		content: "";
		position: absolute;
		top: 50%;
		left: -19px;
		width: 1px;
		height: 18px;
		background: var(--secondary);
		opacity: 0;
		transform: translateY(-50%) scaleY(0.45);
		transition: opacity 0.18s ease, transform 0.18s ease;
	}

	a:hover,
	a.active {
		color: var(--secondary);
	}

	a.active::before {
		opacity: 1;
		transform: translateY(-50%) scaleY(1);
	}

	a.sub {
		padding-left: 12px;
		font-size: 12.5px;
	}

	@media (prefers-reduced-motion: reduce) {
		a,
		a::before {
			transition: none;
		}
	}
</style>
