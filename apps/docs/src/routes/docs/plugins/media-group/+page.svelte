<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/media-group`;

	const handlerMode = `import { Bot } from "@yaebal/core";
import { mediaGroup } from "@yaebal/media-group";

const bot = new Bot(token);

bot.install(
  mediaGroup(async (ctx, messages) => {
    // ctx — the context of the album's first message
    // messages — every part, sorted by message_id
    await ctx.reply(\`album received: \${messages.length} parts\`);
  }),
);`;

	const passThroughMode = `bot.install(mediaGroup()).on("message", async (ctx) => {
  if (ctx.mediaGroup) {
    // the album's first message, with the whole group attached
    return ctx.reply(\`album of \${ctx.mediaGroup.length}\`);
  }
  // plain messages arrive as usual — ctx.mediaGroup is undefined
});`;

	const saveAlbum = `bot.install(
  mediaGroup(
    async (ctx, messages) => {
      for (const msg of messages) {
        const photo = msg.photo?.[msg.photo.length - 1];
        if (photo) await savePhoto(photo.file_id);
      }
      await ctx.reply(\`saved \${messages.length} items\`);
    },
    {
      delayMs: 300,
      // albums flush from a timer — outside bot.onError's reach
      onError: (error, _ctx, messages) =>
        console.error(\`album of \${messages.length} failed\`, error),
    },
  ),
);`;

	const editedAlbums = `bot.install(
  mediaGroup(
    (ctx, messages) => {
      // ctx.updateType tells the kinds apart: "message" vs "edited_message"
      if (ctx.updateType === "edited_message") return handleEdit(messages);
      return handleAlbum(messages);
    },
    { updates: ["message", "edited_message"] },
  ),
);`;

	const shutdown = `const albums = mediaGroup(async (ctx, messages) => {
  await persist(messages);
});

bot.install(albums);

// deliver half-collected albums instead of dropping them
bot.onStop(() => albums.flush());`;

	const typedHandler = `import type { Context } from "@yaebal/core";
import type { Session } from "@yaebal/session";

// installed after session()? pin the handler's context view explicitly —
// the enrichment is on ctx at runtime either way
bot.install(
  mediaGroup<Context & { session: Session<Data> }>(async (ctx, messages) => {
    ctx.session.albums += 1;
  }),
);`;
</script>

<svelte:head>
	<title>@yaebal/media-group — yaebal</title>
</svelte:head>

<h1>@yaebal/media-group</h1>
<p class="lead">collect albums into one handler call or a <code>ctx.mediaGroup</code> pass-through</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	telegram delivers an album as separate updates that share a <code>media_group_id</code>. this
	plugin buffers them — per update kind, chat and group id — and hands over the whole album in one
	piece: sorted by <code>message_id</code>, deduplicated, flushed after a short debounce or
	immediately once all 10 possible parts arrived. two modes:
</p>
<p>
	<strong>handler mode</strong> — pass a handler and it fires once per album. album parts are
	consumed; they never reach middleware installed after the plugin.
</p>
<Code code={handlerMode} title="bot.ts" />
<p>
	<strong>pass-through mode</strong> — no handler: the album's <em>first</em> update continues down
	the chain with <code>ctx.mediaGroup</code> set to the whole group, so filter queries, sessions
	and downstream plugins keep working. the remaining parts are consumed.
</p>
<Code code={passThroughMode} title="pass-through.ts" />

<h2>what appears on ctx</h2>
<p>
	in pass-through mode the plugin's <code>Out</code> is <code>MediaGroupExtension</code> — after
	<code>.install(mediaGroup())</code> every handler sees
	<code>ctx.mediaGroup?: Message[]</code>: the sorted album on the group's first update,
	<code>undefined</code> everywhere else. handler mode adds nothing to the context.
</p>

<h2>collection rules</h2>
<ul>
	<li>
		groups are keyed by update kind + chat id + <code>media_group_id</code>. the id is only unique
		<em>within</em> a chat — a channel album auto-forwarded into its linked discussion group keeps
		the channel's id, and the two never merge.
	</li>
	<li>
		each incoming part extends the debounce window by <code>delayMs</code>; a full album of 10
		parts flushes immediately.
	</li>
	<li>
		parts are deduplicated by <code>message_id</code> (webhook retries can redeliver an update)
		and flushed in <code>message_id</code> order even when they arrive shuffled.
	</li>
	<li>
		edited updates (<code>edited_message</code>, <code>edited_channel_post</code>,
		<code>edited_business_message</code>) pass through untouched by default — opt in via
		<code>updates</code>, and each kind collects into its own group so an edit never pollutes a
		freshly arriving album.
	</li>
</ul>
<Code code={saveAlbum} title="save-album.ts" />

<h2>edited albums</h2>
<p>
	listing an edited kind in <code>updates</code> batches caption edits the same way new albums are
	batched. the handler tells them apart by <code>ctx.updateType</code>.
</p>
<Code code={editedAlbums} title="edited-albums.ts" />

<h2>graceful shutdown</h2>
<p>
	<code>mediaGroup(...)</code> returns the plugin with a <code>flush()</code> method: it delivers
	every pending album right away and resolves once all handlers settle — wire it to
	<code>bot.onStop</code> so a half-collected album isn't lost on shutdown.
</p>
<Code code={shutdown} title="shutdown.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>mediaGroup</code></td><td><code>(handler: MediaGroupHandler&lt;C&gt;, options?: MediaGroupOptions&lt;C&gt;) =&gt; MediaGroupPlugin&lt;C&gt;</code></td><td>handler mode — fires once per album, parts are consumed</td></tr>
		<tr><td><code>mediaGroup</code></td><td><code>(options?: MediaGroupOptions&lt;C&gt;) =&gt; MediaGroupPlugin&lt;C, MediaGroupExtension&gt;</code></td><td>pass-through mode — first update continues with <code>ctx.mediaGroup</code></td></tr>
		<tr><td><code>MediaGroupHandler</code></td><td><code>(ctx: C, messages: Message[]) =&gt; unknown</code></td><td>called once per album, messages sorted by <code>message_id</code></td></tr>
		<tr><td><code>MediaGroupOptions</code></td><td><code>&#123; delayMs?, updates?, onError? &#125;</code></td><td>see below</td></tr>
		<tr><td><code>MediaGroupExtension</code></td><td><code>&#123; mediaGroup?: Message[] &#125;</code></td><td>what pass-through mode adds to the context</td></tr>
		<tr><td><code>MediaGroupPlugin</code></td><td><code>Plugin&lt;In, Out&gt; &amp; &#123; flush(): Promise&lt;void&gt; &#125;</code></td><td>the plugin function plus album controls</td></tr>
		<tr><td><code>MediaGroupUpdateName</code></td><td><code>"message" | "edited_message" | …</code></td><td>the update kinds that can carry a <code>media_group_id</code></td></tr>
	</tbody>
</table>

<h3>MediaGroupOptions</h3>
<table>
	<thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>delayMs</code></td><td><code>number</code></td><td><code>200</code></td><td>how long to wait for the next album part before flushing.</td></tr>
		<tr><td><code>updates</code></td><td><code>MediaGroupUpdateName[]</code></td><td><code>["message", "channel_post", "business_message"]</code></td><td>which update kinds are collected. kinds not listed pass through untouched.</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, ctx, messages) =&gt; unknown</code></td><td><code>console.error</code></td><td>called when the album handler (or the downstream chain in pass-through mode) throws.</td></tr>
	</tbody>
</table>

<h2>typed contexts in handler mode</h2>
<p>
	the handler's <code>ctx</code> defaults to the base <code>Context</code>. when the plugin is
	installed after enriching plugins, their additions are present on the context at runtime — pin
	the type parameter to see them:
</p>
<Code code={typedHandler} title="typed-handler.ts" />
<p>
	pass-through mode doesn't need this — the chain's accumulated context type flows into
	downstream handlers as usual.
</p>

<h2>testing</h2>
<p>
	the package ships a <code>node:test</code> suite covering consumption, cross-chat keying,
	dedup, ordering, the 10-part short-circuit, error routing and both modes — and the
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/media-studio">media-studio example</a>
	doubles as a live smoke test: send an album and it replies with the photo/video breakdown.
</p>

<div class="note">
	<strong>state is in-memory.</strong> all parts of an album must land in the same process —
	behind multiple workers or serverless instances, route each chat's updates to one instance.
	albums also flush from a timer, outside the middleware chain, which is why errors go to
	<code>onError</code> instead of <code>bot.onError</code>.
</div>
