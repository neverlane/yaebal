<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/workers`;

	const tasks = `// tasks.ts — runs in a worker thread
import { register } from "@yaebal/workers";

register({
  resize: (buf) => sharp(buf).resize(100).toBuffer(),
  hash:   (s)   => crypto.createHash("sha256").update(s).digest("hex"),
});`;

	const bot = `// bot — stays on the main event loop
import { media } from "@yaebal/core";
import { createPool } from "@yaebal/workers";

const pool = createPool(new URL("./tasks.js", import.meta.url), { size: 4 });

bot.on("message:photo", async (ctx) => {
  const thumb = await pool.run("resize", await ctx.download()); // → thread → back
  await ctx.sendPhoto(media.buffer(thumb));
});

// on shutdown
await pool.destroy();`;

	const transfer = `// pass a buffer as a transferable — no copy, the bytes move to the worker
const ab = bytes.buffer;
const out = await pool.run("resize", ab, [ab]);`;
</script>

<svelte:head>
	<title>@yaebal/workers — yaebal</title>
</svelte:head>

<h1>@yaebal/workers</h1>
<p class="lead">a tiny worker_threads pool — offload CPU-heavy bits, keep the bot on the main loop</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>when to reach for it</h2>
<p>
	most handlers are i/o-bound and already served by
	<a href="/docs/runner/">@yaebal/runner</a>'s concurrency. threads help only for genuinely
	CPU-heavy work: image processing, crypto, heavy parsing. offload <em>that</em> — not the whole bot.
</p>

<h2>usage</h2>
<p>
	<code>register(handlers)</code> inside a worker file declares the named tasks the pool can call.
	<code>createPool(file, options?)</code> spawns the workers; <code>pool.run(name, arg?)</code> sends
	<code>arg</code> to the next worker (round-robin) and resolves with the result.
</p>
<Code code={tasks} title="tasks.ts" />
<Code code={bot} title="bot.ts" />

<h2>transferables</h2>
<p>
	the third argument to <code>run</code> is a list of <code>Transferable</code> objects passed to
	<code>postMessage</code> — buffers move to the worker without a copy.
</p>
<Code code={transfer} title="transfer.ts" />

<h2>how it works</h2>
<p>
	the main thread posts <code>name</code> + <code>arg</code> to the next worker; the worker runs the
	registered function and posts the result back, resolving the <code>run</code> promise by id. if a
	worker errors or exits, in-flight calls on it reject and the thread is respawned automatically.
	<code>destroy()</code> terminates every worker and rejects anything still in flight.
</p>

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>createPool</code></td><td><code>(workerFile: string | URL, options?: PoolOptions) =&gt; Pool</code></td><td>spawn a pool of workers</td></tr>
		<tr><td><code>register</code></td><td><code>(handlers: TaskHandlers) =&gt; void</code></td><td>called inside the worker file to expose tasks</td></tr>
		<tr><td><code>Pool</code></td><td>interface</td><td><code>run</code> / <code>destroy</code> / <code>size</code></td></tr>
		<tr><td><code>PoolOptions</code></td><td><code>&#123; size?: number &#125;</code></td><td>number of worker threads (default <code>1</code>)</td></tr>
		<tr><td><code>TaskHandlers</code></td><td><code>Record&lt;string, (arg) =&gt; unknown | Promise&lt;unknown&gt;&gt;</code></td><td>the task map passed to <code>register</code></td></tr>
	</tbody>
</table>

<h3>Pool</h3>
<table>
	<thead><tr><th>member</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>run</code></td><td><code>&lt;R&gt;(name: string, arg?: unknown, transfer?: readonly Transferable[]) =&gt; Promise&lt;R&gt;</code></td><td>run a registered task on the next worker (round-robin)</td></tr>
		<tr><td><code>destroy</code></td><td><code>() =&gt; Promise&lt;void&gt;</code></td><td>terminate all workers; reject anything in flight</td></tr>
		<tr><td><code>size</code></td><td><code>number</code></td><td>number of worker threads (readonly)</td></tr>
	</tbody>
</table>

<div class="note">
	<strong>built .js only.</strong> the worker file must be a built <code>.js</code> (or run under a
	TS loader). workers don't share closures with the main thread — they only receive the data you
	pass to <code>run</code>. <code>register()</code> throws if called outside a worker thread.
</div>
