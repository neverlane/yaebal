<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/inline-results`;

	const usage = `import { InlineQueryResult, InputMessageContent } from "@yaebal/inline-results";

bot.on("inline_query", async (ctx) => {
  await ctx.api.answerInlineQuery({
    inline_query_id: ctx.inlineQuery.id,
    results: [
      InlineQueryResult.article(
        "1",
        "yaebal",
        InputMessageContent.text("yet another telegram bot api library"),
        { description: "a type-safe, extensible telegram bot api framework" },
      ),
      InlineQueryResult.photo("2", "https://example.com/cat.jpg", "https://example.com/cat_thumb.jpg"),
      InlineQueryResult.cached.audio("3", "AwACAgIAA...", { performer: "yaebal" }),
    ],
  });
});`;

	const formatted = `import { html } from "@yaebal/fmt";

// caption / message_text accept a FormattedText ({ text, entities }) in addition
// to a plain string — bot.api decomposes it into the wire fields automatically
InlineQueryResult.article(
  "1",
  "yaebal",
  InputMessageContent.text(html\`<b>yaebal</b> — yet another telegram bot api library\`),
);`;

	const cached = `InlineQueryResult.cached.photo(id, photoFileId);
InlineQueryResult.cached.document(id, title, documentFileId);
InlineQueryResult.cached.sticker(id, stickerFileId);
// + gif, mpeg4Gif, video, voice, audio`;

	const inputMessageContent = `InputMessageContent.text("hello");
InputMessageContent.location(51.5, -0.12);
InputMessageContent.venue(51.5, -0.12, "Big Ben", "Westminster");
InputMessageContent.contact("+123456789", "Ann");
InputMessageContent.invoice("Widget", "a widget", "payload1", "USD", [
  { label: "Widget", amount: 500 },
]);`;
</script>

<svelte:head>
	<title>@yaebal/inline-results — yaebal</title>
</svelte:head>

<h1>@yaebal/inline-results</h1>
<p class="lead">
	typed builders for every <code>InlineQueryResult</code> and <code>InputMessageContent</code>
	variant, so an <code>answerInlineQuery</code> payload reads as data instead of a hand-rolled
	object literal — a typo in a field name is a compile error, not a silent <code>400</code> from
	telegram.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	every builder takes the variant's <em>required</em> fields positionally, and a trailing options
	object for everything optional (<code>reply_markup</code>, thumbnails, captions, durations, …) —
	typed straight off <a href="/docs/types/"><code>@yaebal/types</code></a>, so it can't
	drift from the real schema.
</p>
<Code code={usage} title="bot.ts" />

<h2>formatted text</h2>
<p>
	<code>caption</code> and <code>message_text</code> accept a <code>FormattedText</code>
	(<code>&#123; text, entities &#125;</code> — what <code>format</code> from
	<a href="/docs/plugins/fmt/"><code>@yaebal/fmt</code></a> or core's tag functions produce) in
	addition to a plain string. pass it through as-is — <code>bot.api</code> decomposes it into the
	wire fields the same way it does for every other formatted-text param.
</p>
<Code code={formatted} title="formatted.ts" />

<h2>cached.*</h2>
<p>
	the <code>file_id</code>-backed variants (already on telegram's servers, not fetched from a url)
	live under <code>InlineQueryResult.cached</code>:
</p>
<Code code={cached} title="cached.ts" />

<h2>InputMessageContent</h2>
<p>
	covers <code>text</code>, <code>location</code>, <code>venue</code>, <code>contact</code> and
	<code>invoice</code>. not covered: rich block-tree content — build that with
	<a href="/docs/plugins/rich/"><code>@yaebal/rich</code></a>, its output already satisfies
	<code>InputMessageContent</code>.
</p>
<Code code={inputMessageContent} title="content.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>covers</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>InlineQueryResult.article/audio/contact/document/game/gif/location/mpeg4Gif/photo/venue/video/voice</code></td>
			<td>url-backed result variants</td>
		</tr>
		<tr>
			<td><code>InlineQueryResult.cached.audio/document/gif/mpeg4Gif/photo/sticker/video/voice</code></td>
			<td><code>file_id</code>-backed result variants</td>
		</tr>
		<tr>
			<td><code>InputMessageContent.text/location/venue/contact/invoice</code></td>
			<td><code>input_message_content</code> payloads</td>
		</tr>
		<tr>
			<td><code>InlineQueryResultValue</code> / <code>InputMessageContentValue</code></td>
			<td>the raw <code>@yaebal/types</code> union types, re-exported (renamed to avoid colliding
			with the builder namespaces above)</td>
		</tr>
	</tbody>
</table>

<div class="note">
	no context wiring, no <code>bot.install(...)</code> — this package is a plain set of builder
	functions you call wherever you build an <code>answerInlineQuery</code> payload.
</div>
