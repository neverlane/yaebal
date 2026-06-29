<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	
	import { theme } from "$lib/theme.svelte";
	import SEO from "$lib/SEO.svelte";

	let { children } = $props();

	onMount(() => theme.init());
</script>

<SEO />
{@render children()}
