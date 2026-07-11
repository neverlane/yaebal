<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/feature-flags`;

	const usage = `import { featureFlags } from "@yaebal/feature-flags";

bot.install(
  featureFlags({
    flags: {
      "new-ui": { default: false, rules: [{ percentage: 25 }] },
      maintenance: false,
    },
  }),
);

bot.command("start", async (ctx) => {
  const welcome = (await ctx.flags.isEnabled("new-ui")) ? "welcome to the new ui!" : "welcome!";
  await ctx.reply(welcome);
});`;

	const rules = `featureFlags({
  flags: {
    "new-ui": {
      default: false,
      // ANY rule enables the flag (OR). within one rule, all set conditions must hold (AND).
      rules: [
        { percentage: 10 },                // 10% of buckets, deterministic per user
        { userIds: [12345, "67890"] },     // always on for these users
        { from: new Date("2026-03-01"), to: new Date("2026-04-01") }, // date window
      ],
    },
  },
});`;

	const overrides = `import { redisStorage } from "@yaebal/sklad";

bot.install(featureFlags({ flags: { "new-ui": false }, storage: redisStorage(client) }));

bot.command("beta", async (ctx) => {
  await ctx.flags.setOverride("new-ui", true); // wins over provider and local rules
  await ctx.reply("you're in!");
});

// later: await ctx.flags.clearOverride("new-ui");`;

	const providers = `import { growthBookAdapter, launchDarklyAdapter } from "@yaebal/feature-flags";

// LaunchDarkly — any client satisfying { variation(key, context, defaultValue) }
bot.install(featureFlags({ flags: { "new-ui": false }, provider: launchDarklyAdapter(ldClient) }));

// GrowthBook — attributes are re-applied before every check, since GrowthBook targeting reads
// whatever's currently set on the client rather than taking a context per call
bot.install(
  featureFlags({
    flags: { "new-ui": false },
    provider: growthBookAdapter(gbClient, { attributes: (evalContext) => ({ id: evalContext.userId }) }),
  }),
);`;

	const standalone = `import { createFlags } from "@yaebal/feature-flags";

const flags = createFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } });
await flags.isEnabled("new-ui", { userId: 42 });`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { featureFlags } from "@yaebal/feature-flags";

const bot = new Composer<Context>()
  .install(featureFlags({ flags: { "new-ui": { default: false, rules: [{ userIds: [1] }] } } }))
  .command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("new-ui"))));

const env = createTestEnv(bot);
await env.createUser({ id: 1 }).sendCommand("check"); // "true" — id 1 is targeted
await env.createUser({ id: 2 }).sendCommand("check"); // "false"`;
</script>

<svelte:head>
	<title>@yaebal/feature-flags — yaebal</title>
</svelte:head>

<h1>@yaebal/feature-flags</h1>
<p class="lead">
	<code>ctx.flags.isEnabled(key)</code> — feature flags with persisted overrides via
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a>, percentage / user-id / date-window
	rollout rules, and adapters for external providers (LaunchDarkly, GrowthBook). evaluation order
	per check is <strong>override → provider → local rules → default</strong>. reach for it when you
	want to gate a feature behind a gradual rollout, target specific users, or delegate the decision
	to a provider you already run — without hand-rolling the bucketing math.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>featureFlags()</code> with <code>bot.install()</code>. it adds <code>ctx.flags</code>
	to every handler's context. <code>flags</code> is the catalog: a plain <code>boolean</code> for a
	static flag, or a <code>FlagDefinition</code> for rollout rules. the bucket key is per-user by
	default (<code>ctx.from.id</code>, falling back to <code>ctx.chat.id</code>) — override with
	<code>getContext</code>.
</p>
<Try id="feature-flags-override" title="bot.ts" />
<Code code={usage} title="bot.ts" />

<h2>rollout rules</h2>
<p>
	a flag with <code>rules</code> is enabled if <strong>any</strong> rule matches (OR); within one
	rule, every condition you set must hold (AND). percentage rollout hashes
	<code>{"`${key}:${bucketKey}`"}</code> with fnv-1a (exported as <code>bucketOf</code> for testing)
	— stable across restarts and processes, unlike <code>Math.random()</code>, so the same user always
	gets the same answer.
</p>
<Code code={rules} title="bot.ts" />

<h2>overrides</h2>
<p>
	force a flag for one bucket — an admin panel toggle, a support workaround — persisted via
	<code>storage</code> (defaults to in-memory, lost on restart). an override always wins, even over
	a configured provider.
</p>
<Code code={overrides} title="bot.ts" />

<h2>external providers</h2>
<p>
	<code>provider</code> is consulted before the local catalog — a defined <code>true</code>/<code
	>false</code> wins, <code>undefined</code> falls through to local rules. both adapters type their
	client structurally (<code>LaunchDarklyClientLike</code>/<code>GrowthBookClientLike</code>), so this
	package depends on neither SDK.
</p>
<Code code={providers} title="bot.ts" />

<h2>standalone use</h2>
<p>
	<code>createFlags(options)</code> builds a client independent of any bot or <code>ctx</code> — same
	shape as <code>ctx.flags</code>, plus an explicit <code>evalContext</code> per call.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>featureFlags</code></td>
			<td><code>(options: FeatureFlagsOptions) =&gt; Plugin&lt;Context, {"{ flags: FlagsControl }"}&gt;</code></td>
			<td>installs <code>ctx.flags</code></td>
		</tr>
		<tr>
			<td><code>createFlags</code></td>
			<td><code>(options: FeatureFlagsOptions) =&gt; Flags</code></td>
			<td>standalone client, independent of any bot or <code>ctx</code></td>
		</tr>
		<tr>
			<td><code>bucketOf</code></td>
			<td><code>(input: string) =&gt; number</code></td>
			<td>deterministic <code>[0, 100)</code> hash behind percentage rollout</td>
		</tr>
		<tr>
			<td><code>launchDarklyAdapter</code></td>
			<td><code>(client: LaunchDarklyClientLike) =&gt; FlagProvider</code></td>
			<td>consult a LaunchDarkly server-side client</td>
		</tr>
		<tr>
			<td><code>growthBookAdapter</code></td>
			<td><code>(client: GrowthBookClientLike, options?: GrowthBookAdapterOptions) =&gt; FlagProvider</code></td>
			<td>consult a GrowthBook client, re-applying attributes per check</td>
		</tr>
	</tbody>
</table>

<h3>FlagsControl interface (ctx.flags)</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>isEnabled(key)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>override → provider → local rules → default</td></tr>
		<tr><td><code>setOverride(key, value)</code></td><td><code>Promise&lt;void&gt;</code></td><td>force <code>key</code> for the current bucket, persisted via <code>storage</code></td></tr>
		<tr><td><code>clearOverride(key)</code></td><td><code>Promise&lt;void&gt;</code></td><td>remove the bucket override</td></tr>
	</tbody>
</table>

<h3>FeatureFlagsOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>flags</code></td><td><code>FlagsCatalog</code></td><td>—</td><td>required. <code>boolean</code> or <code>FlagDefinition</code> per key</td></tr>
		<tr><td><code>storage</code></td><td><code>StorageAdapter&lt;Record&lt;string, boolean&gt;&gt;</code></td><td><code>MemoryStorage</code></td><td>where per-bucket overrides live — any <code>@yaebal/sklad</code> adapter</td></tr>
		<tr><td><code>provider</code></td><td><code>FlagProvider</code></td><td>—</td><td>external provider consulted before local rules</td></tr>
		<tr><td><code>getContext</code></td><td><code>(ctx: Context) =&gt; FlagEvalContext</code></td><td>per-user, falling back to per-chat</td><td>derive the bucket key/clock for an update</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	drive <code>ctx.flags</code> with <a href="/docs/plugins/test/"><code>@yaebal/test</code></a> as
	usual — assert on the reply, or on <code>createFlags(...).isEnabled(key, evalContext)</code>
	directly for unit-level rollout checks.
</p>
<Code code={testing} title="feature-flags.test.ts" />

<div class="note">
	<strong>pairs with sklad.</strong> swap <code>MemoryStorage</code> for
	<a href="/docs/plugins/sklad/"><code>redisStorage</code></a>/<code>sqliteStorage</code> so
	overrides survive restarts and are shared across processes — the same options work no matter
	which adapter is behind it.
</div>
