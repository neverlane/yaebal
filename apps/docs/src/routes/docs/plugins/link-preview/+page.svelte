<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/link-preview`;

	const usage = `import { linkPreview } from "@yaebal/link-preview";

bot.command("share", (ctx) =>
  ctx.reply("check this out: https://example.com", {
    link_preview_options: linkPreview("https://example.com")
      .showAboveText()
      .preferLargeMedia()
      .build(),
  }),
);`;

	const disableUsage = `import { disableLinkPreview, linkPreview } from "@yaebal/link-preview";

// shorthand — nothing else to configure
await ctx.reply("no preview here: https://example.com", {
  link_preview_options: disableLinkPreview(),
});

// same thing spelled out via the builder
await ctx.reply("no preview here: https://example.com", {
  link_preview_options: linkPreview().disable().build(),
});`;

	const toJsonUsage = `// the builder also serializes correctly on its own, since Api stringifies
// request bodies through JSON.stringify — link_preview_options: linkPreview(...)
// would produce the same wire payload as .build(), but .build() keeps the
// param's static type as plain LinkPreviewOptions.
JSON.stringify({ link_preview_options: linkPreview("https://example.com").showAboveText() });`;
</script>

<svelte:head>
	<title>@yaebal/link-preview — yaebal</title>
</svelte:head>

<h1>@yaebal/link-preview</h1>
<p class="lead">
	fluent builder for telegram's <code>link_preview_options</code> — the field
	<code>sendMessage</code>, <code>editMessageText</code>, and friends take to control the
	automatic link preview.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>linkPreview(url?)</code> starts a builder, optionally pre-seeded with a url. chain the
	options you need, then call <code>.build()</code> to get the plain
	<code>LinkPreviewOptions</code> object the api expects.
</p>
<Code code={usage} title="bot.ts" />

<h2>disabling the preview</h2>
<p>
	<code>disableLinkPreview()</code> is a shorthand for <code>&#123; is_disabled: true &#125;</code>
	when there's nothing else to configure:
</p>
<Code code={disableUsage} title="disable.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>linkPreview</code></td>
			<td><code>(url?: string) =&gt; LinkPreview</code></td>
			<td>starts a builder, optionally pre-seeded with <code>.url(url)</code></td>
		</tr>
		<tr>
			<td><code>disableLinkPreview</code></td>
			<td><code>() =&gt; LinkPreviewOptions</code></td>
			<td>shorthand for <code>&#123; is_disabled: true &#125;</code></td>
		</tr>
	</tbody>
</table>

<h3>LinkPreview</h3>
<p>every method returns <code>this</code>, so calls chain in any order.</p>
<table>
	<thead>
		<tr><th>method</th><th>sets</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>.url(url)</code></td>
			<td><code>url</code></td>
			<td>url to preview; if omitted, telegram uses the first url found in the message text</td>
		</tr>
		<tr>
			<td><code>.disable(value = true)</code></td>
			<td><code>is_disabled</code></td>
			<td>hides the preview entirely</td>
		</tr>
		<tr>
			<td><code>.preferSmallMedia(value = true)</code></td>
			<td><code>prefer_small_media</code></td>
			<td>shrinks the preview media; ignored if the url isn't set or resizing isn't supported for it</td>
		</tr>
		<tr>
			<td><code>.preferLargeMedia(value = true)</code></td>
			<td><code>prefer_large_media</code></td>
			<td>enlarges the preview media; ignored if the url isn't set or resizing isn't supported for it</td>
		</tr>
		<tr>
			<td><code>.showAboveText(value = true)</code></td>
			<td><code>show_above_text</code></td>
			<td>renders the preview above the message text instead of below it</td>
		</tr>
		<tr>
			<td><code>.build()</code></td>
			<td>—</td>
			<td>returns the plain <code>LinkPreviewOptions</code> object</td>
		</tr>
		<tr>
			<td><code>.toJSON()</code></td>
			<td>—</td>
			<td>same as <code>.build()</code>, for <code>JSON.stringify</code></td>
		</tr>
	</tbody>
</table>
<Code code={toJsonUsage} title="tojson.ts" />

<div class="note">
	<strong><code>.preferSmallMedia()</code> and <code>.preferLargeMedia()</code> are independent
	flags</strong> with no mutual-exclusion logic — that matches telegram's own api shape, which
	is equally permissive.
	<br /><br />
	no context wiring, no <code>bot.install(...)</code> — this package is a plain builder you call
	wherever you build request options.
</div>
