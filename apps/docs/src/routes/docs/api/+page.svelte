<script lang="ts">
	import Code from "$lib/Code.svelte";
	import { BOT_API_VERSION, apiCategories, apiMethods, apiTypes } from "$lib/api/data.generated";

	const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

	const example = `import type { SendMessageParams, Message } from "@yaebal/types";

// every method: full params + return type, cross-linked to its own reference page
await bot.api.call<Message>("sendMessage", {
  chat_id: 123456789,
  text: "hello!",
} satisfies SendMessageParams);

// a growing subset also gets a direct typed shortcut on \`Api\`:
await bot.api.sendMessage({ chat_id: 123456789, text: "hello!" });

// ...and/or a context shortcut, wired by @yaebal/contexts:
bot.on("message", (ctx) => ctx.send("hello!"));`;
</script>

<svelte:head>
	<title>Bot API reference — yaebal</title>
</svelte:head>

<h1>Bot API reference</h1>
<p class="lead">
	every Telegram Bot API method and type — <strong>{apiMethods.length} methods</strong>,
	<strong>{apiTypes.length} types</strong>, Bot API <strong>{BOT_API_VERSION}</strong> — with a
	yaebal-specific usage example on every page. generated from
	<code>packages/types/schema.json</code>, the same single source of truth
	<a href="/docs/types">@yaebal/types</a> and <a href="/docs/contexts">@yaebal/contexts</a> are
	code-generated from — nothing here is hand-maintained, so it can't drift.
</p>

<h2>calling a method</h2>
<p>
	three ways a method can end up typed, from most to least common — every method page below shows
	whichever apply:
</p>
<Code code={example} title="bot.ts" />

{#each apiCategories as category (category.title)}
	<h2 id={slug(category.title)}>{category.title}</h2>

	{#if category.methods.length}
		<h3>methods <span class="count">{category.methods.length}</span></h3>
		<ul class="grid">
			{#each category.methods as name (name)}
				<li><a class="mono" href="/docs/api/methods/{name}">{name}</a></li>
			{/each}
		</ul>
	{/if}

	{#if category.types.length}
		<h3>types <span class="count">{category.types.length}</span></h3>
		<ul class="grid">
			{#each category.types as name (name)}
				<li><a class="mono" href="/docs/api/types/{name}">{name}</a></li>
			{/each}
		</ul>
	{/if}
{/each}

<style>
	.count {
		font-weight: 400;
		color: var(--gray);
		font-size: 0.8em;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 6px 10px;
		list-style: none;
		padding: 0;
		margin: 12px 0 24px;
	}

	.grid li {
		margin: 0;
		min-width: 0;
	}

	.grid li a {
		display: block;
		padding: 6px 10px;
		border-radius: 9px;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--secondary);
	}

	@media (hover: hover) {
		.grid li a:hover {
			background: var(--code-bg);
			color: var(--blue);
		}
	}
</style>
