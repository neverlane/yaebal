<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/scenes`;

	const stepModel = `import { defineScene } from "@yaebal/scenes";

const echo = defineScene({
  steps: [
    async (ctx) => {
      if (ctx.scene.firstTime) return ctx.send("say something");
      await ctx.send(\`you said: \${ctx.text}\`);
      return ctx.scene.next(); // past the last step → the scene finishes
    },
  ],
});`;

	const askExample = `import { z } from "zod"; // any standard-schema library: zod, valibot, arktype
import { ask, defineScene } from "@yaebal/scenes";

const signup = defineScene<Context, { email: string; age: number }>({
  steps: [
    ask("email", {
      question: "your email?",
      parse: z.string().email(), // schema issues become the error message
    }),
    ask("age", {
      question: (ctx) => \`thanks! how old are you?\`,
      // or a plain function: undefined = invalid, stays on the step
      parse: (text) => (/^\\d+$/.test(text) ? Number(text) : undefined),
      invalid: "age is a number — try again",
    }),
  ],
});`;

	const navigation = `const flow = defineScene<Context, { a: string }>({
  steps: [
    ask("a", { question: "A?" }),
    {
      name: "review", // named steps: ctx.scene.go("review")
      handler: async (ctx) => {
        if (ctx.scene.firstTime) return ctx.send(\`review: \${ctx.scene.state.a}\`);
        if (ctx.text === "back") return ctx.scene.previous(); // re-asks A
        if (ctx.text === "edit") return ctx.scene.go("a");
        return ctx.scene.leave();
      },
    },
  ],
});`;

	const subScenes = `const qty = defineScene<Context, { qty: number }>({
  steps: [ask("qty", { question: "how many?", parse: parseQty })],
  onLeave: async (ctx, info) => {
    // hand the result back to whoever suspended us
    if (info.reason === "finish") await ctx.scene.exitSub({ qty: ctx.scene.state.qty });
  },
});

// inside a parent step:
//   ctx.scene.enterSub("qty")  → suspends the parent, runs qty
//   when qty exits, the merge lands in the parent's state and the
//   parent's current step re-asks its question`;

	const persistence = `import { scenes } from "@yaebal/scenes";
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis";

bot.install(scenes(defs, {
  storage: redisStorage(new Redis()), // any StorageAdapter<SceneSnapshot>
  ttl: 15 * 60_000,                   // expire abandoned wizards after 15 min
}));

// a restart now resumes users mid-wizard: scene, step, state bag and all`;

	const routing = `bot.install(scenes(defs, {
  // updates the current step doesn't claim fall through to normal handlers
  passthrough: true,            // default; false = swallow, predicate = exempt
  // /commands bypass an active scene, so global handlers keep working
  passCommands: ["cancel", "help"], // default true (all commands)
}));

// a global /cancel that works mid-wizard — no per-step checks needed
bot.command("cancel", (ctx) =>
  ctx.scene.active ? ctx.scene.leave({ cancelled: true }) : ctx.send("nothing to cancel"));`;

	const hooks = `const quest = defineScene<Context & { session: Profile }, QuestState>({
  initial: () => ({ tries: 0 }),        // the state bag before enter({ state }) merges
  onEnter: (ctx) => track("quest_start"),
  onLeave: (ctx, info) => {
    // info.reason: "finish" | "leave" | "switch" | "reenter" | "expired"
    if (info.cancelled) return ctx.send("quest cancelled");
    if (info.reason === "finish") Object.assign(ctx.session, ctx.scene.state);
  },
  beforeStep: (ctx) => console.log("step", ctx.scene.step, ctx.scene.stepName),
  steps: [/* … */],
});`;
</script>

<svelte:head>
	<title>@yaebal/scenes — yaebal</title>
</svelte:head>

<h1>@yaebal/scenes</h1>
<p class="lead">
	durable, step-by-step wizards. every step is self-contained — it asks its own question on a
	<code>firstTime</code> pass, then processes each answer — so wizards can navigate
	(<code>next</code>/<code>previous</code>/<code>go</code>), nest (<code>enterSub</code>), validate
	(<code>ask</code>), and resume mid-flow after a restart from any persistent storage adapter.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>a first wizard</h2>
<p>
	declare scenes with <code>defineScene</code> (pinning the context, the typed state bag and enter
	params), register them with <code>scenes(&#123; name: def &#125;)</code>, and start one from any
	handler with <code>ctx.scene.enter(name)</code> — scene names are typed, a typo is a compile
	error.
</p>
<Try id="scenes-wizard" />

<h2>the step model</h2>
<p>
	each step runs in two kinds of passes. on the <strong>question pass</strong>
	(<code>ctx.scene.firstTime === true</code>, right after entering or navigating) it asks its
	question and returns. on every <strong>processing pass</strong> it receives an update the step
	claims, reads the answer, and navigates — or doesn't, which keeps the user on the step (that is
	the validation loop). running past the last step finishes the scene.
</p>
<Code code={stepModel} title="step-model.ts" />

<h2>ask(): one-liner question steps</h2>
<p>
	<code>ask(key, options)</code> builds the whole question-validate-store-advance step. the parsed
	answer lands in <code>ctx.scene.state[key]</code>; the step is named after the key, so
	<code>go("email")</code> jumps back to it. <code>parse</code> accepts any
	<a href="https://github.com/standard-schema/standard-schema">standard-schema</a> validator (zod,
	valibot, arktype — typed structurally, no dependency) or a plain function.
</p>
<Code code={askExample} title="ask.ts" />

<h2>navigation and named steps</h2>
<Code code={navigation} title="navigation.ts" />

<h2>steps over buttons</h2>
<p>
	a step claims fresh messages by default. give it <code>on</code> filter queries — the same
	mini-language as <code>bot.on(...)</code> — to build inline-keyboard wizards; anything the step
	doesn't claim falls through to your normal handlers.
</p>
<Try id="scenes-buttons" />

<h2>sub-scenes</h2>
<p>
	<code>enterSub</code> suspends the current scene on a stack and runs another; when the sub-scene
	finishes (or calls <code>exitSub(merge)</code>), the parent resumes at its current step, re-asks
	its question, and <code>merge</code> lands in the parent's state bag. reusable fragments — an
	address form, a quantity picker — become scenes of their own.
</p>
<Code code={subScenes} title="sub-scenes.ts" />

<h2>hooks and typed context</h2>
<p>
	the def's context parameter declares plugin dependencies: a scene over
	<code>Context &amp; &#123; session: Profile &#125;</code> type-errors unless the session plugin is
	installed first (core invariant #4), and <code>ctx.session</code> is typed inside every step.
</p>
<Code code={hooks} title="hooks.ts" />

<h2>routing: passthrough and commands</h2>
<p>
	scenes are polite by default. updates the current step doesn't claim fall through to normal
	handlers, and <code>/commands</code> bypass the scene entirely — a global <code>/cancel</code> or
	<code>/help</code> keeps working mid-wizard with zero per-step boilerplate.
</p>
<Code code={routing} title="routing.ts" />

<h2>persistence and ttl</h2>
<p>
	the whole wizard — scene, step, state bag, params, sub-scene stack — is one json snapshot in a
	<code>StorageAdapter&lt;SceneSnapshot&gt;</code>. the default is in-memory; pass any
	<code>@yaebal/sklad</code> adapter (redis, sqlite, cloudflare kv, json file) and restarts resume
	users exactly where they were. <code>ttl</code> expires abandoned wizards, firing
	<code>onLeave</code> with reason <code>"expired"</code>.
</p>
<Code code={persistence} title="persistence.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>scenes(defs, options?)</code></td>
			<td
				>the plugin. adds <code>ctx.scene</code>; scene names, enter state and params are typed from
				<code>defs</code></td
			>
		</tr>
		<tr>
			<td><code>defineScene&lt;C, S, P&gt;(def)</code></td>
			<td>identity helper that pins a def's context, state bag and params types</td>
		</tr>
		<tr>
			<td><code>ask(key, options)</code></td>
			<td>ready-made question step: asks, validates, stores to state, advances</td>
		</tr>
		<tr>
			<td><code>SceneDef</code> / <code>Step</code> / <code>StepDef</code></td>
			<td
				>a def: <code>initial</code>, <code>onEnter</code>, <code>onLeave</code>,
				<code>beforeStep</code>, <code>afterStep</code>, <code>steps</code>. a step is a bare
				handler or <code>&#123; name?, on?, handler &#125;</code></td
			>
		</tr>
		<tr>
			<td><code>SceneContext&lt;C, S, P&gt;</code></td>
			<td>the context steps receive: <code>C &amp; &#123; scene: ActiveScene&lt;S, P&gt; &#125;</code></td>
		</tr>
		<tr>
			<td><code>SceneSnapshot</code></td>
			<td>the persisted shape — what a custom <code>StorageAdapter</code> stores</td>
		</tr>
	</tbody>
</table>

<h3>ctx.scene inside a step (ActiveScene)</h3>
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>state</code> / <code>params</code></td>
			<td>the typed state bag (mutate freely — persisted automatically) and enter params</td>
		</tr>
		<tr>
			<td><code>step</code> / <code>stepName</code> / <code>firstTime</code> / <code>name</code></td>
			<td>where the user is: index, step name, question-pass flag, scene name</td>
		</tr>
		<tr>
			<td><code>next()</code> / <code>previous()</code> / <code>go(step, opts?)</code></td>
			<td
				>move and run the target's question pass now. <code>go</code> takes an index or a step name;
				past the last step = finish</td
			>
		</tr>
		<tr>
			<td><code>leave(opts?)</code> / <code>reenter(opts?)</code></td>
			<td
				><code>leave(&#123; cancelled, silent &#125;)</code> ends everything (sub-stack included);
				<code>reenter</code> restarts from step 0</td
			>
		</tr>
		<tr>
			<td><code>enter(name, opts?)</code> / <code>enterSub(name, opts?)</code> / <code>exitSub(merge?)</code></td>
			<td>switch scenes, or suspend into a sub-scene and come back with data</td>
		</tr>
	</tbody>
</table>

<h3>ctx.scene everywhere else (SceneControl)</h3>
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>enter(name, opts?)</code></td>
			<td
				>start a wizard. <code>opts.state</code> seeds the bag, <code>opts.params</code> is typed
				per scene, <code>opts.silent</code> defers the first question. throws on unknown names and
				keyless updates</td
			>
		</tr>
		<tr>
			<td><code>leave(opts?)</code></td>
			<td>end the active scene (no-op without one) — what a global /cancel calls</td>
		</tr>
		<tr>
			<td><code>current</code> / <code>active</code></td>
			<td>the active scene's (typed) name, and whether one is active</td>
		</tr>
	</tbody>
</table>

<h3>ScenesOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>storage</code></td>
			<td><code>MemoryStorage</code></td>
			<td>any <code>StorageAdapter&lt;SceneSnapshot&gt;</code> — see <code>@yaebal/sklad</code></td>
		</tr>
		<tr>
			<td><code>getKey</code></td>
			<td><code>chat.id:from.id</code></td>
			<td
				>per user per chat: group-safe, and a wizard doesn't follow the user across chats.
				<code>undefined</code> disables scenes for the update</td
			>
		</tr>
		<tr>
			<td><code>passthrough</code></td>
			<td><code>true</code></td>
			<td
				>unclaimed updates fall through (<code>true</code>), are swallowed (<code>false</code>), or
				a predicate exempts updates from the scene entirely</td
			>
		</tr>
		<tr>
			<td><code>passCommands</code></td>
			<td><code>true</code></td>
			<td>commands bypassing the scene: all, an allowlist array, or none</td>
		</tr>
		<tr>
			<td><code>ttl</code></td>
			<td>—</td>
			<td>ms of inactivity before an abandoned scene expires (lazily, on the next update)</td>
		</tr>
		<tr>
			<td><code>now</code></td>
			<td><code>Date.now</code></td>
			<td>clock override, mainly for tests</td>
		</tr>
	</tbody>
</table>

<div class="note">
	<strong>steps claim fresh messages only.</strong> edited messages, channel posts, reactions and
	the rest never re-enter a wizard unless a step opts in via <code>on</code>. that also means a
	step's <code>on: ["callback_query:data"]</code> is all it takes to consume button presses.
	<br /><br />
	<strong>self-healing snapshots.</strong> a snapshot pointing at a scene or step that no longer
	exists (a deploy shrank the wizard) is deleted on the next update instead of shadowing the user
	forever; <code>enter()</code> with an unknown name throws instead of persisting garbage.
	<br /><br />
	<strong>state must stay json-serializable.</strong> the state bag round-trips through the
	storage adapter — keep it data, not class instances.
	<br /><br />
	<strong>concurrency.</strong> snapshots are read-modify-write per update. the built-in long poll
	is sequential and <code>@yaebal/runner</code>'s default per-chat lanes align with the default
	key; on webhooks, serialize updates per chat yourself or two simultaneous answers can race.
</div>

<h2>testing</h2>
<p>
	wizards test end-to-end with <code>@yaebal/test</code> actors: send the trigger command, answer
	with <code>user.sendMessage(...)</code>, press buttons with <code>user.click(...)</code>, and
	assert on <code>env.callsTo("sendMessage")</code> and the storage contents.
	<code>packages/scenes/src/index.test.ts</code> covers every behavior on this page and doubles as
	a cookbook.
</p>

<h2>related</h2>
<p>
	<a href="/docs/plugins/conversation">@yaebal/conversation</a> — the coroutine alternative
	(<code>await cv.wait()</code>) for flows that don't need durable snapshots ·
	<a href="/docs/plugins/prompt">@yaebal/prompt</a> — a one-shot "ask once, handle the reply" ·
	<a href="/docs/plugins/session">@yaebal/session</a> — long-lived per-chat state the wizard can
	write its results into.
</p>
