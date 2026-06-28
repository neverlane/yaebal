<script lang="ts">
	import { onMount } from "svelte";

	import { goto } from "$app/navigation";
	import { base } from "$app/paths";
	
	import Code from "./Code.svelte";
	import { EXAMPLES } from "./examples";
	import { runUserCode } from "./playground-run";

	let { id, title = "bot.ts" }: { id: string; title?: string } = $props();

	const ex = $derived(EXAMPLES[id]);
	let svg = $state("");
	let wrap = $state<HTMLDivElement>();

	onMount(async () => {
		if (!ex) return;

		const w = Math.round(wrap?.clientWidth || 360);
		const res = await runUserCode(ex.code, ex.steps, w);

		svg = res.svg;
	});

	function open() {
		goto(`${base}/playground?ex=${id}`);
	}
</script>

{#if ex}
	<div class="try" bind:this={wrap}>
		<Code code={ex.code} {title} onTry={open} />
		{#if svg}
			<div class="chat">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html svg}
			</div>
		{/if}
	</div>
{/if}

<style>
	.try {
		margin: 16px 0;
	}
	.chat {
		margin-top: 10px;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	.chat :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
