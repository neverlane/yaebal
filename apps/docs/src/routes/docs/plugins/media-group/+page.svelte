<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/media-group`;

	const basic = `import { Bot } from "@yaebal/core";
import { mediaGroup } from "@yaebal/media-group";

const bot = new Bot(token);

bot.install(
  mediaGroup(
    (ctx, messages) => {
      console.log("album received:", messages.length, "parts");
      // ctx is the context of the first part that arrived
    },
    { delayMs: 200 }, // optional — defaults to 200ms
  ),
);`;

	const saveAlbum = `bot.install(
  mediaGroup(async (ctx, messages) => {
    for (const msg of messages) {
      const photo = msg.photo?.[msg.photo.length - 1];
      if (photo) await savePhoto(photo.file_id);
    }
    await ctx.reply(\`saved \${messages.length} items\`);
  }),
);`;
</script>

<svelte:head>
	<title>@yaebal/media-group — yaebal</title>
</svelte:head>

<h1>@yaebal/media-group</h1>
<p class="lead">called once per album, with every message in the group</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	telegram delivers an album as separate updates that share a <code>media_group_id</code>. this
	plugin buffers those updates and fires <code>handler(ctx, messages)</code> once, after a short
	debounce — so you get the whole album in a single call. pass it to <code>bot.install()</code>.
</p>
<Code code={basic} title="bot.ts" />

<h2>debounce</h2>
<p>
	each incoming album part resets a timer. once <code>delayMs</code> passes with no new part, the
	handler fires. multiple concurrent albums are tracked independently by their
	<code>media_group_id</code>. the <code>ctx</code> handed to the handler is the context of the
	first part that arrived; <code>messages</code> holds every part in arrival order.
</p>
<Code code={saveAlbum} title="save-album.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>mediaGroup</code></td><td><code>(handler: MediaGroupHandler, options?: MediaGroupOptions) =&gt; Plugin</code></td><td>buffers album parts, fires the handler once</td></tr>
		<tr><td><code>MediaGroupHandler</code></td><td><code>(ctx: Context, messages: Message[]) =&gt; unknown | Promise&lt;unknown&gt;</code></td><td>called once per album</td></tr>
		<tr><td><code>MediaGroupOptions</code></td><td><code>&#123; delayMs?: number &#125;</code></td><td>see below</td></tr>
	</tbody>
</table>

<h3>MediaGroupOptions</h3>
<table>
	<thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>delayMs</code></td><td><code>number</code></td><td>no</td><td>how long to wait for more album parts before firing. defaults to <code>200</code> (ms).</td></tr>
	</tbody>
</table>

<div class="note">
	<strong>album parts are consumed.</strong> updates carrying a <code>media_group_id</code> are
	handled here and never reach other handlers. messages without one pass through to
	<code>next()</code> unchanged.
</div>
