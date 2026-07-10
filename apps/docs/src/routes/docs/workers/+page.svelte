<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/workers`;

	const tasks = `// tasks.ts — runs in a worker thread
import { register } from "@yaebal/workers";

export type Tasks = {
  resize: (buf: Uint8Array) => Promise<Uint8Array>;
  hash: (s: string) => string;
};

register<Tasks>({
  resize: (buf) => sharp(buf).resize(100).toBuffer(),
  hash:   (s)   => crypto.createHash("sha256").update(s).digest("hex"),
});`;

	const bot = `// bot — stays on the main event loop
import { media } from "@yaebal/core";
import { files } from "@yaebal/files";
import { createPool } from "@yaebal/workers";
import type { Tasks } from "./tasks.js";

const pool = createPool<Tasks>(new URL("./tasks.js", import.meta.url), { size: 4 });

bot.install(files()).on("message:photo", async (ctx) => {
  const largest = ctx.message.photo.at(-1)!;
  const bytes = await ctx.files.download(largest.file_id);
  const thumb = await pool.run("resize", bytes, { timeout: 5_000 }); // typed: Uint8Array in, Uint8Array out
  await ctx.sendPhoto(media.buffer(thumb));
});

// on shutdown — drain in-flight tasks, then terminate
await pool.close();`;

	const plugin = `// wire the pool onto the context and tie its lifecycle to the bot
import { tasks } from "@yaebal/workers/plugin";

const bot = new Bot(token).install(tasks(pool)); // ctx.tasks, closed on bot.stop()

bot.command("thumb", async (ctx) => {
  const bytes = await ctx.files.download(fileId);
  await ctx.sendPhoto(media.buffer(await ctx.tasks.run("resize", bytes)));
});`;

	const cancel = `// per call: a timeout (or an external AbortSignal) cancels the task
const controller = new AbortController();
const scored = pool.run("score", input, { timeout: 3_000, signal: controller.signal });

// worker side: settle promptly when the signal fires and the worker keeps living
register<Tasks>({
  score: ({ text, rounds }, { signal }) => {
    for (let i = 0; i < rounds; i++) {
      if (signal.aborted) throw new Error("aborted");
      // …crunch…
    }
    return result;
  },
});`;

	const transfer = `// move the buffer to the worker (no copy), and move the result back
import { move } from "@yaebal/workers";

register<Tasks>({ resize: (buf) => move(out, [out.buffer]) }); // ← move back
const out = await pool.run("resize", bytes, { transfer: [bytes.buffer] }); // ← move in`;

	const resilience = `// crash recovery, backpressure and observability come built in
const pool = createPool<Tasks>(workerFile, {
  size: "auto",              // availableParallelism() - 1
  maxQueue: 512,             // run() rejects with QueueFullError past this
  worker: { resourceLimits: { maxOldGenerationSizeMb: 256 } }, // a bomb crashes one worker, alone
});

await pool.ready();          // resolves when every worker registered, rejects if it can't start
pool.on("worker:crash", ({ worker, code, willRespawn }) =>
  console.warn("worker", worker, "died", code, willRespawn ? "(respawning)" : "(dead)"));

pool.stats(); // { size, ready, busy, dead, queued, running, completed, failed, restarts }`;
</script>

<svelte:head>
	<title>@yaebal/workers — yaebal</title>
</svelte:head>

<h1>@yaebal/workers</h1>
<p class="lead">a typed worker_threads pool — offload cpu-heavy bits, keep the bot on the main loop</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>when to reach for it</h2>
<p>
	most handlers are i/o-bound and already served by
	<a href="/docs/runner/">@yaebal/runner</a>'s concurrency. threads help only for genuinely
	cpu-heavy work: image processing, crypto, heavy parsing. offload <em>that</em> — not the whole bot.
</p>

<h2>usage</h2>
<p>
	<code>register&lt;Tasks&gt;(handlers)</code> inside a worker file declares the named tasks the pool
	can call. <code>createPool&lt;Tasks&gt;(file, options?)</code> spawns the workers; share the
	<code>Tasks</code> type between the two and <code>pool.run(name, arg?, options?)</code> fully infers
	the argument and result types per task. tasks queue centrally and dispatch to the least-busy ready
	worker — a slow task never blocks an idle one.
</p>
<Code code={tasks} title="tasks.ts" />
<Code code={bot} title="bot.ts" />

<h2>bot integration</h2>
<p>
	<code>@yaebal/workers/plugin</code> puts the pool on the context as <code>ctx.tasks</code> and
	closes it when the bot stops, so you never leak a pool on shutdown. install it on the
	<code>Bot</code> itself so the plugin can hook <code>onStop</code>. drivers that own their own loop
	(like <a href="/docs/runner/">@yaebal/runner</a>) don't fire the bot's stop handlers — install with
	<code>tasks(pool, &#123; onStop: false &#125;)</code> and close the pool yourself.
</p>
<Code code={plugin} title="plugin.ts" />

<h2>timeouts &amp; cancellation</h2>
<p>
	every task handler gets an <code>AbortSignal</code> as its second argument. a <code>timeout</code>
	(per call or pool-wide) or an external <code>signal</code> aborts it: settle promptly when the
	signal fires and the worker survives; ignore it and the worker is terminated after
	<code>killTimeout</code> (default 500ms) and respawned. a queued task that's aborted is dropped
	before it ever runs.
</p>
<Code code={cancel} title="cancel.ts" />

<h2>transferables &amp; zero-copy</h2>
<p>
	pass <code>transfer</code> to move a buffer to the worker instead of copying it, and wrap a result
	in <code>move()</code> to move it back — the bytes change owners without a clone.
</p>
<Code code={transfer} title="transfer.ts" />

<h2>resilience</h2>
<p>
	a worker that crashes, is killed after a timeout, or trips its <code>resourceLimits</code> rejects
	only its in-flight tasks and respawns with backoff; a worker file that can't even start is retried
	up to <code>maxRestarts</code> times, then the slot is declared dead — no fork-bomb, no infinite
	respawn loop. <code>maxQueue</code> bounds the backlog, <code>pool.ready()</code> surfaces startup
	failures, and <code>pool.stats()</code> / <code>pool.on(…)</code> give you observability.
</p>
<Code code={resilience} title="resilience.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>createPool</code></td><td><code>&lt;Tasks&gt;(workerFile: string | URL, options?: PoolOptions) =&gt; Pool&lt;Tasks&gt;</code></td><td>spawn a pool of workers</td></tr>
		<tr><td><code>register</code></td><td><code>&lt;Tasks&gt;(handlers: TaskHandlers&lt;Tasks&gt;) =&gt; void</code></td><td>called inside the worker file to expose tasks</td></tr>
		<tr><td><code>move</code></td><td><code>&lt;T&gt;(value: T, transfer: Transferable[]) =&gt; T</code></td><td>move a task result back to the main thread, no copy</td></tr>
		<tr><td><code>tasks</code></td><td><code>(pool, options?) =&gt; Plugin</code></td><td><code>/plugin</code> — expose the pool as <code>ctx.tasks</code></td></tr>
		<tr><td><code>isWorkerThread</code></td><td><code>boolean</code></td><td>guard <code>register()</code> in single-file setups</td></tr>
	</tbody>
</table>

<h3>PoolOptions</h3>
<table>
	<thead><tr><th>option</th><th>type</th><th>default</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>size</code></td><td><code>number | "auto"</code></td><td><code>1</code></td><td>worker threads; <code>"auto"</code> = <code>availableParallelism() - 1</code></td></tr>
		<tr><td><code>concurrency</code></td><td><code>number</code></td><td><code>1</code></td><td>tasks a single worker runs at once</td></tr>
		<tr><td><code>maxQueue</code></td><td><code>number</code></td><td><code>Infinity</code></td><td>max tasks waiting before <code>run</code> throws <code>QueueFullError</code></td></tr>
		<tr><td><code>timeout</code></td><td><code>number</code> (ms)</td><td>none</td><td>default per-task execution timeout</td></tr>
		<tr><td><code>killTimeout</code></td><td><code>number</code> (ms)</td><td><code>500</code></td><td>grace period for an aborted task before its worker is killed</td></tr>
		<tr><td><code>maxRestarts</code></td><td><code>number</code></td><td><code>5</code></td><td>consecutive crashes-without-ready before a slot is declared dead</td></tr>
		<tr><td><code>worker</code></td><td><code>PoolWorkerOptions</code></td><td>—</td><td><code>workerData</code> / <code>resourceLimits</code> / <code>env</code> / <code>execArgv</code></td></tr>
	</tbody>
</table>

<h3>Pool</h3>
<table>
	<thead><tr><th>member</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>run</code></td><td><code>(name, arg?, options?: RunOptions) =&gt; Promise&lt;result&gt;</code></td><td>run a task on the next free worker; <code>arg</code> and result inferred from <code>Tasks[name]</code></td></tr>
		<tr><td><code>ready</code></td><td><code>() =&gt; Promise&lt;void&gt;</code></td><td>resolves when all workers registered; rejects if the pool can't start</td></tr>
		<tr><td><code>close</code></td><td><code>(options?: &#123; timeout?: number &#125;) =&gt; Promise&lt;void&gt;</code></td><td>drain queued + running tasks, then terminate</td></tr>
		<tr><td><code>destroy</code></td><td><code>() =&gt; Promise&lt;void&gt;</code></td><td>terminate now; reject everything in flight</td></tr>
		<tr><td><code>stats</code></td><td><code>() =&gt; PoolStats</code></td><td>queue depth, worker states, lifetime counters</td></tr>
		<tr><td><code>on</code></td><td><code>(event, listener) =&gt; () =&gt; void</code></td><td><code>"worker:ready"</code> / <code>"worker:crash"</code>; returns unsubscribe</td></tr>
		<tr><td><code>size</code></td><td><code>number</code></td><td>number of worker threads (readonly)</td></tr>
	</tbody>
</table>

<p>
	<code>RunOptions</code> is <code>&#123; transfer?, signal?, timeout? &#125;</code>. errors thrown in a
	task cross the thread with their <code>name</code>, <code>message</code> and <code>stack</code>
	intact; pool errors are typed — <code>QueueFullError</code>, <code>TaskTimeoutError</code>,
	<code>UnknownTaskError</code>, <code>WorkerCrashError</code>, <code>PoolClosedError</code> (all
	extend <code>PoolError</code>).
</p>

<div class="note">
	<strong>built .js only.</strong> the worker file must be a built <code>.js</code> (or run under a
	ts loader — workers inherit the parent's <code>--experimental-strip-types</code>). workers don't
	share closures with the main thread; they only receive the data you pass to <code>run</code>.
	<code>register()</code> throws outside a worker thread — guard with <code>isWorkerThread</code> in
	single-file setups. <code>Pool</code> implements <code>Symbol.asyncDispose</code>, so
	<code>await using pool = createPool(…)</code> destroys it at scope exit.
</div>
