<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import { theme } from "$lib/theme.svelte";

	let { children } = $props();

	onMount(() => theme.init());
</script>

{@render children()}
