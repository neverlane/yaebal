<script lang="ts">
	import { page } from "$app/stores";

	interface Props {
		title?: string;
		description?: string;
	}

	let {
		title = "yaebal — type-safe Telegram Bot API framework",
		description = "type-safe, chainable, plugin-first Telegram Bot API framework for TypeScript.",
	}: Props = $props();

	const canonical = $derived($page.url.origin + $page.url.pathname);
	const fullTitle = $derived(title.includes("yaebal") ? title : `${title} — yaebal`);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
</svelte:head>
