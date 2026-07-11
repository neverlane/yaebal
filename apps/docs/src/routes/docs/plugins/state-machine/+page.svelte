<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/state-machine`;

	const guards = `type OrderEvent = { type: "PAY" } | { type: "SHIP" } | { type: "CANCEL" };

const order = defineMachine<Context, OrderEvent, { paidAt?: number }>({
  initial: "created",
  states: {
    created: {
      on: {
        PAY: {
          target: "paid",
          actions: (ctx) => { ctx.machine.context.paidAt = Date.now(); },
        },
        CANCEL: { target: "cancelled" },
      },
    },
    paid: {
      on: {
        // a guard rejecting skips to the next candidate for the same event
        SHIP: { target: "shipped", guard: (ctx) => ctx.machine.context.paidAt !== undefined },
        CANCEL: { target: "cancelled" },
      },
    },
    shipped: {},
    cancelled: {},
  },
});`;

	const hooks = `const order = defineMachine<Context, OrderEvent>({
  initial: "created",
  states: {
    created: { on: { PAY: { target: "paid" } } },
    paid: {
      onEnter: (ctx, info) => ctx.send(\`payment received (from \${info.from})\`),
      onLeave: (ctx, info) => console.log("leaving paid for", info.to, "via", info.event.type),
      on: { SHIP: { target: "shipped" } },
    },
    shipped: {
      onEnter: (ctx) => ctx.send("your order shipped 📦"),
    },
  },
});

// onEnter fires on the machine's very first activation too — info.from is undefined then`;

	const persistence = `import { stateMachine } from "@yaebal/state-machine";
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis";

bot.install(stateMachine(order, {
  storage: redisStorage(new Redis()), // any StorageAdapter<MachineSnapshot>
  ttl: 60 * 60_000,                   // reset an inactive machine after an hour
}));

// a restart now resumes a key in the same state, extended-state bag and all`;

	const control = `bot.command("status", (ctx) => ctx.reply(ctx.machine.state));

bot.command("ship", async (ctx) => {
  if (!ctx.machine.can("SHIP")) return ctx.reply("nothing to ship yet");
  const moved = await ctx.machine.send({ type: "SHIP" });
  return ctx.reply(moved ? \`now \${ctx.machine.state}\` : "can't ship from here");
});

bot.command("reset", (ctx) => ctx.machine.reset());`;
</script>

<svelte:head>
	<title>@yaebal/state-machine — yaebal</title>
</svelte:head>

<h1>@yaebal/state-machine</h1>
<p class="lead">
	a declarative finite-state machine backed by <code>@yaebal/sklad</code> storage: typed events,
	guarded transitions, <code>onEnter</code>/<code>onLeave</code> hooks. unlike
	<a href="/docs/plugins/scenes">@yaebal/scenes</a>, there are no steps and no explicit
	<code>enter()</code> — a key's machine is always active, starting at <code>initial</code> the
	first time it's seen, and moves only when a typed event you send matches a transition declared
	for the current state.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>a first machine</h2>
<p>
	declare a machine with <code>defineMachine</code> (pinning the context, the typed event union
	and the extended-state bag), register it with <code>stateMachine(def)</code>, and dispatch
	typed events from any handler with <code>ctx.machine.send(event)</code> — event types the
	current state doesn't declare are a compile error inside <code>on</code>.
</p>
<Try id="state-machine-order" />

<h2>guarded transitions</h2>
<p>
	a state can declare several transitions for the same event as an array. they are tried in
	order; a <code>guard</code> returning <code>false</code> skips to the next candidate.
	<code>send()</code> resolves <code>true</code> only if a transition actually fired — otherwise
	the state is unchanged. <code>actions</code> run after <code>onLeave</code>, before the
	target's <code>onEnter</code>, and can mutate <code>ctx.machine.context</code> freely.
</p>
<Code code={guards} title="guards.ts" />

<h2>hooks</h2>
<p>
	<code>onEnter</code>/<code>onLeave</code> are declared per state and fire on every
	activation/exit of that state — including the machine's very first activation, where
	<code>onEnter</code> runs with <code>info.from === undefined</code>.
</p>
<Code code={hooks} title="hooks.ts" />

<h2>reading and driving the machine</h2>
<Code code={control} title="control.ts" />

<h2>persistence and ttl</h2>
<p>
	the current state and extended-state bag are one json snapshot in a
	<code>StorageAdapter&lt;MachineSnapshot&gt;</code>. the default is in-memory; pass any
	<code>@yaebal/sklad</code> adapter (redis, sqlite, cloudflare kv, json file) and restarts
	resume a key in the same state. <code>ttl</code> resets an inactive machine to
	<code>initial</code> lazily, on the key's next update — no <code>onLeave</code> fires for the
	expired state since no event drove the reset, only the initial state's <code>onEnter</code>
	(with <code>info.from</code> set to the expired state's name).
</p>
<Code code={persistence} title="persistence.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>stateMachine(def, options?)</code></td>
			<td>the plugin. adds <code>ctx.machine</code>, typed from <code>def</code></td>
		</tr>
		<tr>
			<td><code>defineMachine&lt;C, Event, MCtx&gt;(def)</code></td>
			<td>identity helper that pins a def's context, event union and extended-state bag types</td>
		</tr>
		<tr>
			<td
				><code>MachineDef</code> / <code>StateNodeDef</code> / <code>TransitionDef</code></td
			>
			<td
				>a def: <code>initial</code>, <code>context</code>, <code>states</code>. a state node is
				<code>&#123; onEnter?, onLeave?, on? &#125;</code>; a transition is
				<code>&#123; target, guard?, actions? &#125;</code></td
			>
		</tr>
		<tr>
			<td><code>MachineContext&lt;C, Event, MCtx&gt;</code></td>
			<td
				>the context hooks/guards/actions receive: <code
					>C &amp; &#123; machine: ActiveMachine&lt;Event, MCtx&gt; &#125;</code
				></td
			>
		</tr>
		<tr>
			<td><code>MachineSnapshot</code></td>
			<td>the persisted shape — what a custom <code>StorageAdapter</code> stores</td>
		</tr>
	</tbody>
</table>

<h3>ctx.machine (ActiveMachine)</h3>
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>state</code> / <code>context</code></td>
			<td>the current state's name, and the typed extended-state bag (mutate freely — persisted automatically)</td>
		</tr>
		<tr>
			<td><code>matches(state)</code></td>
			<td>is the current state exactly <code>state</code>?</td>
		</tr>
		<tr>
			<td><code>can(type)</code></td>
			<td>would <code>send</code> with an event of this type find a declared transition? guards are not evaluated</td>
		</tr>
		<tr>
			<td><code>send(event)</code></td>
			<td>dispatch a typed event; resolves <code>true</code> if a transition fired</td>
		</tr>
		<tr>
			<td><code>reset()</code></td>
			<td>back to <code>initial</code>, rebuilding the context bag — fires <code>onEnter</code> like the first activation</td>
		</tr>
	</tbody>
</table>

<h3>StateMachineOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>storage</code></td>
			<td><code>MemoryStorage</code></td>
			<td>any <code>StorageAdapter&lt;MachineSnapshot&gt;</code> — see <code>@yaebal/sklad</code></td>
		</tr>
		<tr>
			<td><code>getKey</code></td>
			<td><code>chat.id:from.id</code></td>
			<td
				>per user per chat. <code>undefined</code> means the machine still runs but is never
				persisted — a fresh <code>initial</code> state every update</td
			>
		</tr>
		<tr>
			<td><code>ttl</code></td>
			<td>—</td>
			<td>ms of inactivity before an idle machine resets to <code>initial</code> (lazily, on the next update)</td>
		</tr>
		<tr>
			<td><code>now</code></td>
			<td><code>Date.now</code></td>
			<td>clock override, mainly for tests</td>
		</tr>
	</tbody>
</table>

<div class="note">
	<strong>always active, no enter/leave lifecycle.</strong> unlike <code>@yaebal/scenes</code>,
	a key doesn't opt into the machine — it starts in <code>initial</code> the moment it's first
	seen. there's no <code>enter</code>/<code>leave</code> to call; just <code>send</code> events.
	<br /><br />
	<strong>self-healing snapshots.</strong> a snapshot pointing at a state a deploy removed is
	discarded on the next update and the key resets to <code>initial</code>, instead of shadowing
	it forever.
	<br /><br />
	<strong>extended state must stay json-serializable.</strong> <code>ctx.machine.context</code>
	round-trips through the storage adapter — keep it data, not class instances.
	<br /><br />
	<strong>concurrency.</strong> snapshots are read-modify-write per update, the same caveat as
	<code>@yaebal/scenes</code> — safe under the built-in sequential poll loop and
	<code>@yaebal/runner</code>'s default per-chat lanes; on webhooks, serialize updates per key
	yourself or two simultaneous transitions can race.
</div>

<h2>testing</h2>
<p>
	machines test end-to-end with <code>@yaebal/test</code> actors: send the command that dispatches
	an event, and assert on <code>ctx.machine.state</code>, <code>env.callsTo("sendMessage")</code>
	and the storage contents. <code>packages/state-machine/src/index.test.ts</code> covers every
	behavior on this page.
</p>

<h2>related</h2>
<p>
	<a href="/docs/plugins/scenes">@yaebal/scenes</a> — durable step-by-step wizards, for flows that
	ask questions and navigate rather than react to typed events ·
	<a href="/docs/plugins/conversation">@yaebal/conversation</a> — the coroutine alternative for
	flows that don't need durable snapshots ·
	<a href="/docs/plugins/session">@yaebal/session</a> — long-lived per-chat state a machine's
	<code>onEnter</code>/<code>onLeave</code> hooks can write into.
</p>
