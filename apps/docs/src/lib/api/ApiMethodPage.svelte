<script lang="ts">
	import Code from "$lib/Code.svelte";
	import { apiMethodsByName } from "./data.generated";
	import { linkifyType } from "./linkify";

	let { name }: { name: string } = $props();
	// generated pages only ever pass a name that exists in the schema.
	const method = $derived(apiMethodsByName.get(name)!);
</script>

<svelte:head>
	<title>{method.name} — Bot API reference — yaebal</title>
</svelte:head>

<a class="pill mono" href="/docs/api#{method.category.toLowerCase().replace(/\s+/g, '-')}">{method.category}</a>
<h1 class="mono">{method.name}<span class="kind">()</span></h1>
{#if method.description}
	<div class="lead">{@html method.description}</div>
{/if}

<h2>parameters</h2>
{#if method.params.length}
	<table>
		<thead>
			<tr><th>parameter</th><th>type</th><th>required</th><th>description</th></tr>
		</thead>
		<tbody>
			{#each method.params as p (p.name)}
				<tr>
					<td><code>{p.name}</code></td>
					<td class="mono type">{@html linkifyType(p.type)}</td>
					<td>
						{#if p.required}
							<span class="req">required</span>
						{:else}
							<span class="opt">optional</span>
						{/if}
					</td>
					<td>{@html p.description}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="subtext">this method takes no parameters.</p>
{/if}

<h2>returns</h2>
<p class="mono type">{@html linkifyType(method.returnType)}</p>

<h2>usage in yaebal</h2>
<p>
	{#if method.isApiShortcut}
		<code>{method.name}</code> is directly typed on <code>Api</code> — call it straight off
		<code>bot.api</code>.
	{:else}
		not (yet) hard-typed on <code>Api</code> — call it through the generic
		<code>.call&lt;T&gt;()</code> escape hatch documented in
		<a href="/docs/types">@yaebal/types</a>.
	{/if}
</p>
<Code code={method.usageExample} title="bot.ts" />

{#if method.contextShortcut}
	<h3>context shortcut</h3>
	<p>
		also available as <code>ctx.{method.contextShortcut.name}()</code> on
		{method.contextShortcut.availableOn}
		{method.contextShortcut.availableOn === 1 ? "context type" : "context types"} — see
		<a href="/docs/contexts">@yaebal/contexts</a>.
	</p>
	<Code
		code={`/** ${method.contextShortcut.jsdoc} */\nctx.${method.contextShortcut.signature}`}
		title="context shortcut"
	/>
{/if}

<div class="note">
	official Bot API docs:
	<a href={method.documentationLink} target="_blank" rel="noopener noreferrer"
		>{method.documentationLink}</a
	>
</div>

<style>
	.pill {
		display: inline-block;
		margin-bottom: 10px;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--code-bg);
		border: 1px solid var(--code-stroke);
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.2px;
		color: var(--gray);
	}

	@media (hover: hover) {
		.pill:hover {
			color: var(--blue);
			border-color: var(--blue);
		}
	}

	h1 .kind {
		color: var(--gray);
		font-weight: 400;
	}

	.type :global(a) {
		color: var(--blue);
	}

	.req,
	.opt {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.req {
		background: color-mix(in srgb, var(--red) 14%, transparent);
		color: var(--red);
	}

	.opt {
		background: var(--code-bg);
		color: var(--gray);
	}
</style>
