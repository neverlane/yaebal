<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/conversation`;

	const basic = `import { Bot } from "@yaebal/core";
import { conversation, createConversation } from "@yaebal/conversation";

const greet = createConversation(async (cv, ctx) => {
  await ctx.send("what's your name?");
  const a = await cv.waitFor("message:text"); // narrowed: a.text is a plain string
  await a.send(\`age, \${a.text}?\`);
  const b = await cv.waitFor("message:text");
  await b.send(\`\${a.text} is \${b.text}\`);
});

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(conversation({ greet }));

bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
bot.start();`;

	const waitForExample = `const echo = createConversation(async (cv, ctx) => {
  // waitFor narrows exactly like composer.on() — no manual "if (!ctx.text) return"
  const a = await cv.waitFor("message:text");
  await ctx.send(\`text: \${a.text}\`);

  // waitUntil takes any predicate, sync or async — and narrows with a type guard overload
  const photo = await cv.waitUntil((c): c is typeof c & { message: { photo: unknown } } =>
    Boolean(c.message?.photo));
  await ctx.send("nice photo");
});`;

	const formExample = `const signup = createConversation(async (cv, ctx) => {
  const name = await cv.form.text({ question: "your name?" });

  const age = await cv.form.int({
    question: \`thanks, \${name}! how old are you?\`,
    min: 1,
    max: 120,
    invalid: "age is a number between 1 and 120 — try again",
  });

  const plan = await cv.form.choice({
    question: "pick a plan: free, pro, or team",
    choices: ["free", "pro", "team"] as const,
  });

  const confirmed = await cv.form.confirm({ question: \`lock in \${plan}? (y/n)\` });
  if (!confirmed) return ctx.send("cancelled");

  await ctx.send(\`saved: \${name}, \${age}, \${plan}\`);
});`;

	const routing = `bot.install(conversation({ support }, {
  // an update that doesn't match the *currently parked* wait()/waitFor() filter:
  passthrough: true,                 // default: falls through to normal handlers
  // passthrough: false,             // queued instead (bounded by queueLimit)

  // /commands bypass an active conversation, so global handlers keep working
  passCommands: ["cancel", "help"],  // default true (every command)
}));

// a global /cancel that works mid-conversation — no per-step checks needed
bot.command("cancel", (ctx) =>
  ctx.conversation.active ? ctx.conversation.leave() : ctx.reply("nothing to cancel"));`;

	const timeouts = `import { ConversationTimeoutError } from "@yaebal/conversation";

const patient = createConversation(async (cv, ctx) => {
  try {
    const answer = await cv.waitFor("message:text", { timeout: 60_000 }); // per-call override
    await ctx.send(\`got: \${answer.text}\`);
  } catch (error) {
    if (error instanceof ConversationTimeoutError) return ctx.send("timed out — try again");
    throw error;
  }
});

bot.install(conversation({ patient }, {
  waitTimeout: 5 * 60_000, // default for every wait()/waitFor()/waitUntil()/form.* call
}));

// left uncaught, a timeout just ends the conversation — onLeave fires with reason "timeout"`;

	const signalExample = `const fetching = createConversation(async (cv, ctx) => {
  // aborts automatically if the conversation is left, replaced, or times out mid-fetch
  const res = await fetch("https://api.example.com/status", { signal: cv.signal });
  await ctx.send(await res.text());
});`;

	const keys = `import { conversation, perChat, perChatUser, perUser } from "@yaebal/conversation";

bot.install(conversation({ support }, {
  getKey: perChatUser, // default — one conversation per user *per chat*, group-safe
  // getKey: perChat,  // one shared conversation per chat (any member can answer)
  // getKey: perUser,  // one conversation per user, follows them across every chat
}));`;

	const durable = `import { conversation, createConversation } from "@yaebal/conversation";
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis";

const support = createConversation(async (cv, ctx) => {
  await ctx.send("what's the problem?");
  const topic = await cv.waitFor("message:text");

  // non-deterministic or side-effecting work goes through cv.external() — its result is
  // recorded once and replayed, never re-executed
  const ticketId = await cv.external(() => createTicketId());

  await ctx.send(\`ticket #\${ticketId} queued: \${topic.text}\`);
});

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(conversation({ support }, {
    storage: redisStorage(new Redis()), // any StorageAdapter<unknown> — see @yaebal/sklad
  }));

// a restart now resumes users mid-conversation: every wait() answer, api call and
// cv.external() result replays from the log instead of firing again`;

	const hooks = `bot.install(conversation({ support }, {
  onEnter: (ctx, info) => console.log("entered", info.name, info.params),
  onLeave: (ctx, info) => {
    // info.reason: "finish" | "left" | "replaced" | "timeout" | "error"
    if (info.reason === "finish") console.log("result:", info.result);
    if (info.reason === "error") console.error("conversation crashed:", info.error);
  },
  onError: (error, ctx, info) => reportToSentry(error, { conversation: info.name }),
  onOverflow: (dropped, ctx, info) => console.warn("dropped an update for", info.name),
}));`;

	const enterResult = `const survey = createConversation(async (cv, ctx) => {
  const a = await cv.waitFor("message:text");
  return { answer: a.text }; // read back via onLeave's info.result — see "hooks" above
});

// safe to fire and forget — the recommended style. enter()'s promise resolves once the
// conversation has *started* (bounded, fast), never once it *finishes* (which may need
// updates that arrive through this very handler — awaiting that would deadlock it)
bot.command("survey", (ctx) => ctx.conversation.enter("survey"));`;
</script>

<svelte:head>
	<title>@yaebal/conversation — yaebal</title>
</svelte:head>

<h1>@yaebal/conversation</h1>
<p class="lead">
	write multi-step dialogs as a straight line — <code>await cv.waitFor(...)</code> resolves with the
	next matching update for that key. a coroutine by default; opt into a durable, restart-safe
	replay engine with one option when you need it.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>a first conversation</h2>
<p>
	define each conversation with <code>createConversation(builder)</code>, register them by name
	with <code>conversation(&#123; name: def &#125;)</code> — the same keyed shape as
	<a href="/docs/plugins/scenes">@yaebal/scenes</a>' <code>defs</code> — and start one from any
	handler with <code>ctx.conversation.enter(name)</code>. names are typed from the object you
	pass in, so a typo is a compile error.
</p>
<Code code={basic} title="bot.ts" />
<Try id="conversation-wizard" />

<h2>how it works</h2>
<p>
	unlike grammY's replay-based conversations, the default engine is a <strong>coroutine</strong>:
	the builder runs once, detached, and each <code>wait()</code> call parks a real promise until a
	matching update arrives. no replay means no duplicated side effects — every <code>ctx.send</code>
	fires exactly once. while a conversation is active it owns the updates its current
	<code>wait()</code> call would otherwise miss (see "routing" below); state lives only in memory,
	so it does not survive a restart unless you opt into the durable engine (see below).
</p>

<h2>waitFor / waitUntil</h2>
<p>
	<code>wait()</code> resolves with whatever update arrives next. <code>waitFor(query)</code> takes
	a core filter query (<code>"message:text"</code>, <code>":photo"</code>, …) and narrows the
	result exactly like <code>composer.on()</code> — no more <code>a.text ?? "fallback"</code>.
	<code>waitUntil(predicate)</code> takes any sync or async predicate, with a type-guard overload
	for full narrowing.
</p>
<Code code={waitForExample} title="wait-for.ts" />

<h2>cv.form: ready-made ask loops</h2>
<p>
	<code>text</code>/<code>int</code>/<code>choice</code>/<code>confirm</code> each send a question,
	wait for an answer, validate it, and re-ask on invalid input — built on <code>waitFor</code>, so
	they're just sugar, not a separate mechanism. <code>text</code> and <code>int</code> also accept
	a <a href="https://github.com/standard-schema/standard-schema">standard-schema</a> validator
	(zod, valibot, arktype) via <code>parse</code>.
</p>
<Code code={formExample} title="form.ts" />

<h2>routing: passthrough and commands</h2>
<p>
	conversations are polite by default. an update that doesn't match the currently parked
	<code>wait()</code>/<code>waitFor()</code> filter falls through to normal handlers, and
	<code>/commands</code> bypass the conversation entirely — a global <code>/cancel</code> or
	<code>/help</code> keeps working mid-conversation with zero per-step boilerplate.
</p>
<Code code={routing} title="routing.ts" />

<h2>cancellation and timeouts</h2>
<p>
	<code>ctx.conversation.leave()</code> rejects a parked <code>wait()</code> with
	<code>ConversationExitedError</code> — the builder's <code>finally</code> blocks still run, so
	cleanup isn't skipped. re-entering a conversation that's already active does the same before
	starting the new one, so two builders never race on the same chat. every wait call also accepts
	a <code>timeout</code>, rejecting with <code>ConversationTimeoutError</code> if nothing arrives
	in time — catch it to handle the timeout yourself, or leave it uncaught to end the conversation.
</p>
<Code code={timeouts} title="timeouts.ts" />
<p>
	<code>cv.signal</code> is an <code>AbortSignal</code> that aborts on any of the above — pass it to
	<code>fetch</code> or anything else cancellable.
</p>
<Code code={signalExample} title="signal.ts" />

<h2>session keys</h2>
<p>
	the default key is per user <em>per chat</em> — safe in groups (each member gets their own
	conversation) and doesn't follow a user between an unrelated private chat and a group. two other
	presets cover the rest.
</p>
<Code code={keys} title="keys.ts" />

<h2>the durable engine</h2>
<p>
	pass a <code>StorageAdapter</code> (any <a href="/docs/plugins/sklad">@yaebal/sklad</a> adapter —
	redis, sqlite, cloudflare kv, json file) as <code>options.storage</code> and the plugin switches
	engines: instead of parking in memory, every update <strong>replays the builder from scratch</strong>
	against a recorded log — history resolves instantly from the log (no real work, no duplicate
	sends), and once it catches up to "now" it either parks again (checkpointed) or finishes. a
	restart resumes users exactly where they were.
</p>
<Code code={durable} title="durable.ts" />
<div class="note">
	<strong>the determinism contract.</strong> a durable builder is re-run on every update, so it
	must reach the same <code>wait()</code>/api-call/<code>cv.external()</code> sequence every time:
	route all IO through <code>ctx</code> or <code>cv.external()</code>, never branch on outside
	mutable state, and don't call <code>ctx.api.downloadFile</code> directly (wrap it in
	<code>cv.external()</code> too — it isn't tracked). a builder that violates this is caught with a
	clear error instead of silently misbehaving or duplicating a side effect.
</div>

<h2>hooks</h2>
<p>
	<code>onEnter</code>/<code>onLeave</code>/<code>onError</code>/<code>onOverflow</code> observe a
	conversation's lifecycle from the options you pass to <code>conversation()</code> — the same
	shape on both engines.
</p>
<Code code={hooks} title="hooks.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>conversation(defs, options?)</code></td>
			<td>the plugin. adds <code>ctx.conversation</code>; picks the durable engine when <code>options.storage</code> is set</td>
		</tr>
		<tr>
			<td><code>createConversation&lt;C, R, P&gt;(builder)</code></td>
			<td>define a conversation; declare <code>C</code> when the builder needs more than the base <code>Context</code></td>
		</tr>
		<tr>
			<td><code>perChat</code> / <code>perUser</code> / <code>perChatUser</code></td>
			<td><code>getKey</code> presets — see "session keys" above</td>
		</tr>
		<tr>
			<td><code>ConversationExitedError</code></td>
			<td>rejects a parked <code>wait()</code> on <code>leave()</code>/replace — catch it, or let it unwind the builder</td>
		</tr>
		<tr>
			<td><code>ConversationTimeoutError</code></td>
			<td>rejects a parked <code>wait()</code> after its timeout elapses</td>
		</tr>
		<tr>
			<td><code>ConversationDef</code> / <code>ConversationDefs</code></td>
			<td>the value returned by <code>createConversation</code>, and the record <code>conversation()</code> takes</td>
		</tr>
	</tbody>
</table>

<h3>Conversation (cv)</h3>
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>wait(opts?)</code></td>
			<td>resolve with the next update, whatever it is</td>
		</tr>
		<tr>
			<td><code>waitFor(query, opts?)</code></td>
			<td>resolve with the next update matching a filter query — narrowed like <code>on()</code></td>
		</tr>
		<tr>
			<td><code>waitUntil(predicate, opts?)</code></td>
			<td>resolve with the next update for which <code>predicate</code> is true (sync, async, or a type guard)</td>
		</tr>
		<tr>
			<td><code>form.text/int/choice/confirm(opts)</code></td>
			<td>ask, validate, re-ask on invalid input — see "cv.form" above</td>
		</tr>
		<tr>
			<td><code>external(fn)</code></td>
			<td>run non-deterministic/side-effecting work; recorded and replayed under the durable engine</td>
		</tr>
		<tr>
			<td><code>halt()</code></td>
			<td>stop the conversation now, as if the builder had returned</td>
		</tr>
		<tr>
			<td><code>ctx</code></td>
			<td>the most recent context — the entering update, then each waited one</td>
		</tr>
		<tr>
			<td><code>signal</code></td>
			<td>an <code>AbortSignal</code> that fires on <code>leave()</code>/replace/timeout</td>
		</tr>
	</tbody>
</table>

<h3>ctx.conversation (ConversationControl)</h3>
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>enter(name, params?)</code></td>
			<td>
				start a registered conversation, cancelling one already running for this key first.
				resolves once the conversation has <em>started</em> — see "enter() and its result" below
			</td>
		</tr>
		<tr>
			<td><code>active</code> / <code>current</code></td>
			<td>whether a conversation is running for this key, and its (typed) name — both getters, not methods</td>
		</tr>
		<tr>
			<td><code>leave()</code></td>
			<td>cancel the active conversation (no-op without one); resolves once its builder has fully unwound</td>
		</tr>
		<tr>
			<td><code>snapshot()</code></td>
			<td>a point-in-time read of the active session (<code>name</code>, <code>params</code>, <code>startedAt</code>, <code>lastActivityAt</code>), or <code>undefined</code></td>
		</tr>
	</tbody>
</table>

<h3>ConversationOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>getKey</code></td>
			<td><code>perChatUser</code></td>
			<td>session key for an update. <code>undefined</code> disables the plugin for it (and <code>enter()</code> throws)</td>
		</tr>
		<tr>
			<td><code>passthrough</code></td>
			<td><code>true</code></td>
			<td>a non-matching update falls through (<code>true</code>), is queued (<code>false</code>), or a predicate decides</td>
		</tr>
		<tr>
			<td><code>passCommands</code></td>
			<td><code>true</code></td>
			<td>commands bypassing the conversation: all, an allowlist array, or none</td>
		</tr>
		<tr>
			<td><code>waitTimeout</code></td>
			<td>—</td>
			<td>default ms for every wait call; a call's own <code>&#123; timeout &#125;</code> overrides it</td>
		</tr>
		<tr>
			<td><code>queueLimit</code></td>
			<td><code>100</code></td>
			<td>how many updates to hold while the builder is busy before the oldest is dropped</td>
		</tr>
		<tr>
			<td><code>storage</code></td>
			<td>—</td>
			<td>a <code>StorageAdapter</code> — presence alone switches to the durable replay engine</td>
		</tr>
		<tr>
			<td><code>now</code></td>
			<td><code>Date.now</code></td>
			<td>clock override, mainly for tests</td>
		</tr>
		<tr>
			<td><code>onEnter</code> / <code>onLeave</code> / <code>onError</code> / <code>onOverflow</code></td>
			<td>—</td>
			<td>lifecycle hooks — see "hooks" above</td>
		</tr>
	</tbody>
</table>

<h2>enter() and its result</h2>
<p>
	<code>enter()</code> deliberately does <strong>not</strong> wait for the conversation to finish —
	only for it to start. a builder usually parks on a <code>wait()</code> call expecting a
	<em>later</em> update, and that update arrives through this very dispatch path; a promise that
	stayed pending until then would deadlock the handler that awaited it (and every later update for
	that key with it). read the result back via <code>onLeave</code>'s <code>info.result</code>
	instead — it's set whenever <code>info.reason === "finish"</code>.
</p>
<Code code={enterResult} title="enter-result.ts" />

<div class="note">
	state is in-memory by default (lost on restart), like <a href="/docs/plugins/prompt/">prompt</a>.
	for a single follow-up use <code>prompt</code>; for a branching, always-durable wizard use
	<a href="/docs/plugins/scenes/">scenes</a>; for a straight-line script — durable or not — use
	this.
	<br /><br />
	<strong>works with or without <a href="/docs/runner/">@yaebal/runner</a>.</strong> no deadlock in
	the sequential loop: the live engine's builder is detached and updates are routed to it, not
	awaited inside <code>handleUpdate</code>; the durable engine's turn is always bounded (parks or
	finishes within one update), never waiting on a future one.
</div>

<h2>testing</h2>
<p>
	conversations test end-to-end with <code>@yaebal/test</code> actors: send the trigger command,
	answer with <code>user.sendMessage(...)</code>, and assert on
	<code>env.callsTo("sendMessage")</code>. for the durable engine, build a second
	<code>Composer</code>/<code>TestEnv</code> pair over the same <code>MemoryStorage</code> to
	simulate a restart. <code>packages/conversation/src/live.test.ts</code> and
	<code>replay.test.ts</code> cover every behavior on this page.
</p>

<h2>related</h2>
<p>
	<a href="/docs/plugins/scenes">@yaebal/scenes</a> — declarative, always-durable wizards with
	navigation and sub-scenes ·
	<a href="/docs/plugins/prompt">@yaebal/prompt</a> — a one-shot "ask once, handle the reply" ·
	<a href="/docs/plugins/sklad">@yaebal/sklad</a> — the storage adapters the durable engine runs on.
</p>
