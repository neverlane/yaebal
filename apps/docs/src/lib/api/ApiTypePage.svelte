<script lang="ts">
	import Code from "$lib/Code.svelte";
	import { apiTypesByName } from "./data.generated";
	import { linkifyType } from "./linkify";

	let { name }: { name: string } = $props();
	// generated pages only ever pass a name that exists in the schema.
	const type = $derived(apiTypesByName.get(name)!);
</script>

<svelte:head>
	<title>{type.name} — Bot API reference — yaebal</title>
</svelte:head>

<a class="pill mono" href="/docs/api#{type.category.toLowerCase().replace(/\s+/g, '-')}">{type.category}</a>
<h1 class="mono">{type.name}</h1>
{#if type.description}
	<div class="lead">{@html type.description}</div>
{/if}

{#if type.kind === "properties"}
	<h2>fields</h2>
	{#if type.fields.length}
		<table>
			<thead>
				<tr><th>field</th><th>type</th><th>required</th><th>description</th></tr>
			</thead>
			<tbody>
				{#each type.fields as f (f.name)}
					<tr>
						<td><code>{f.name}</code></td>
						<td class="mono type">{@html linkifyType(f.type)}</td>
						<td>
							{#if f.required}
								<span class="req">required</span>
							{:else}
								<span class="opt">optional</span>
							{/if}
						</td>
						<td>{@html f.description}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="subtext">this object has no fields.</p>
	{/if}
{:else if type.kind === "any_of"}
	<h2>one of</h2>
	<ul class="xref">
		{#each type.variants as v (v)}
			<li class="mono">{@html linkifyType(v)}</li>
		{/each}
	</ul>
{:else}
	<p class="subtext">marker type — carries no additional data.</p>
{/if}

<h2>import</h2>
<Code code={`import type { ${type.name} } from "@yaebal/types";`} title="types.ts" />

{#if type.usedByMethods.length || type.usedByTypes.length}
	<h2>used by</h2>
	{#if type.usedByMethods.length}
		<h3>methods</h3>
		<ul class="xref">
			{#each type.usedByMethods as m (m)}
				<li class="mono"><a href="/docs/api/methods/{m}">{m}</a></li>
			{/each}
		</ul>
	{/if}
	{#if type.usedByTypes.length}
		<h3>types</h3>
		<ul class="xref">
			{#each type.usedByTypes as t (t)}
				<li class="mono"><a href="/docs/api/types/{t}">{t}</a></li>
			{/each}
		</ul>
	{/if}
{/if}

<div class="note">
	official Bot API docs:
	<a href={type.documentationLink} target="_blank" rel="noopener noreferrer">{type.documentationLink}</a>
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

	.xref {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		list-style: none;
		padding: 0;
		margin: 14px 0;
	}

	.xref li {
		margin: 0;
	}

	.xref li a,
	.xref li:not(:has(a)) {
		display: inline-block;
		padding: 4px 10px;
		border-radius: 9px;
		background: var(--code-bg);
		border: 1px solid var(--code-stroke);
		font-size: 12.5px;
	}

	.xref li a {
		color: var(--secondary);
	}

	@media (hover: hover) {
		.xref li a:hover {
			border-color: var(--blue);
			color: var(--blue);
		}
	}
</style>
