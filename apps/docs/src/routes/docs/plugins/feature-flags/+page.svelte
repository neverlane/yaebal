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
      // rules are checked in order — the first match wins. within one rule, every
      // condition you set must hold (AND).
      rules: [
        { percentage: 10 },                       // 10% of buckets, deterministic per user
        { userIds: [12345, "67890"] },             // always on for these users
        { chatTypes: ["group", "supergroup"] },    // only in group chats
        { languageCodes: ["ru", "uk"] },            // only for these telegram client languages
        { premiumOnly: true },                     // only for telegram premium users
        { from: new Date("2026-03-01"), to: new Date("2026-04-01") }, // date window
      ],
    },
    "legacy-mode": {
      default: true,
      // value: false carves out a kill-switch slice, even though the default is true
      rules: [{ userIds: [666], value: false }],
    },
  },
});`;

	const variants = `featureFlags({
  flags: {
    checkout: {
      default: "control",
      // a bucket's variant is picked once, deterministically — same hash as percentage rollout
      variants: [
        { value: "control", weight: 50 },
        { value: "v2", weight: 50 },
      ],
      // rules force a specific variant outright — no on/off, just which value wins
      rules: [{ userIds: [42], value: "v2" }],
    },
  },
});

bot.command("checkout", async (ctx) => {
  const variant = await ctx.flags.getVariant("checkout"); // "control" | "v2", typed
  await ctx.reply(\`checkout: \${variant}\`);
});`;

	const overrides = `import { redisStorage } from "@yaebal/sklad";

bot.install(featureFlags({ flags: { "new-ui": false }, storage: redisStorage(client) }));

bot.command("beta", async (ctx) => {
  await ctx.flags.setOverride("new-ui", true); // wins over provider and local rules, for this bucket
  await ctx.reply("you're in!");
});

bot.command("kill", async (ctx) => {
  // forces every bucket, independent of any per-bucket override — an emergency kill switch
  await ctx.flags.setGlobalOverride("new-ui", false, { ttl: 60 * 60 * 1000 }); // auto-expires in 1h
  await ctx.reply("new-ui disabled for everyone, for the next hour");
});

// later: await ctx.flags.clearOverride("new-ui"); / await ctx.flags.clearGlobalOverride("new-ui");`;

	const guard = `import { flagGuard, whenFlag } from "@yaebal/feature-flags";

// gates everything registered after it in *this* composer — order matters
bot.guard(flagGuard("new-ui")).command("beta-only", (ctx) => ctx.reply("new ui exclusive"));

// an isolated branch instead — doesn't matter where you install it, and it never
// gates a sibling handler registered elsewhere on the same composer
bot.install(
  whenFlag("new-ui", (branch) => branch.command("beta-only", (ctx) => ctx.reply("new ui exclusive"))),
);`;

	const admin = `import { flagsAdmin } from "@yaebal/feature-flags";

bot.install(flagsAdmin({ isAdmin: (ctx) => ctx.from?.id === OWNER_ID }));

// /flags                      — every flag's value for your own bucket
// /flags set new-ui true      — global override (parses true/false, numbers, or a string)
// /flags clear new-ui         — remove the global override`;

	const providers = `import { envProvider, growthBookAdapter, launchDarklyAdapter } from "@yaebal/feature-flags";

// LaunchDarkly — any client satisfying { variationDetail(key, context, defaultValue) }
bot.install(featureFlags({ flags: { "new-ui": false }, provider: launchDarklyAdapter(ldClient) }));

// GrowthBook — a factory builds a fresh client per evaluation, so concurrent updates for
// different users never interleave one another's targeting attributes
bot.install(
  featureFlags({
    flags: { "new-ui": false },
    provider: growthBookAdapter((evalContext) => new GrowthBook({ attributes: { id: evalContext.userId } })),
  }),
);

// process.env — FLAG_NEW_UI=true, no SaaS required
bot.install(featureFlags({ flags: { "new-ui": false }, provider: envProvider() }));`;

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
	<code>ctx.flags.isEnabled(key)</code> / <code>ctx.flags.getVariant(key)</code> — boolean and
	multivariate (A/B/n) feature flags with persisted overrides via
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a>, telegram-native targeting
	(percentage, user/chat id, chat type, language, premium, date window), and adapters for external
	providers (LaunchDarkly, GrowthBook, plain env vars). evaluation order per check is
	<strong>override → global override → provider → local rules → default</strong>. every flag key is
	typed against the catalog you pass in — a typo'd key is a compile error, not a runtime surprise.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>featureFlags()</code> with <code>bot.install()</code>. it adds <code>ctx.flags</code>
	to every handler's context. <code>flags</code> is the catalog: a plain <code>boolean</code> for a
	static flag, a <code>FlagDefinition</code> for rollout rules, or a <code>VariantDefinition</code>
	for a multivariate flag (see below). the bucket identity is per-user by default
	(<code>ctx.from.id</code>, falling back to <code>ctx.chat.id</code>) — override with
	<code>bucketKey</code>; the eval context (telegram targeting fields, clock) comes from
	<code>getContext</code>.
</p>
<Try id="feature-flags-override" title="bot.ts" />
<Code code={usage} title="bot.ts" />

<h2>rollout rules</h2>
<p>
	a flag with <code>rules</code> is enabled if <strong>any</strong> rule matches, checked in order —
	the first match's <code>value</code> wins (defaults to <code>true</code>; set it to
	<code>false</code> to carve out a kill-switch slice even when <code>default</code> is
	<code>true</code>). within one rule, every condition you set must hold (AND). percentage rollout
	hashes <code>{"`${key}:${bucketKey}`"}</code> with fnv-1a (exported as <code>bucketOf</code> for
	testing) — stable across restarts and processes, unlike <code>Math.random()</code>.
</p>
<Code code={rules} title="bot.ts" />

<h2>multivariate flags</h2>
<p>
	give a flag <code>variants</code> instead of a plain <code>default: boolean</code> and it becomes
	an A/B/n test: <code>ctx.flags.getVariant(key)</code> returns one of the declared values, typed as
	their literal union. a bucket's assignment is picked once, deterministically, from the same hash
	behind percentage rollout — so the same user always sees the same variant. <code>rules</code> on a
	variant flag force a specific value outright (no on/off, just which one wins) rather than gating.
</p>
<Try id="feature-flags-variants" title="bot.ts" />
<Code code={variants} title="bot.ts" />

<h2>overrides</h2>
<p>
	force a flag for one bucket — an admin command, a support workaround — persisted via
	<code>storage</code> (defaults to in-memory, lost on restart). a per-bucket override always wins,
	even over a configured provider. <code>setGlobalOverride</code> forces every bucket at once — a
	kill switch that needs no redeploy — and both accept an optional <code>ttl</code> so the override
	expires on its own. overrides live under their own <code>flags:</code>-prefixed keys, so sharing
	one <code>storage</code> adapter with <code>@yaebal/session</code> or another yaebal plugin never
	collides.
</p>
<Code code={overrides} title="bot.ts" />

<h2>guard &amp; whenFlag</h2>
<p>
	<code>flagGuard</code>/<code>variantGuard</code> plug straight into <code>bot.guard()</code> — but
	like any guard, they gate everything registered <em>after</em> them in that composer, so where you
	call it matters. <code>whenFlag</code> instead builds an isolated branch (the same primitive behind
	<code>Composer.filter</code>) — installing it never gates a handler registered elsewhere on the
	same composer, regardless of order.
</p>
<Code code={guard} title="bot.ts" />

<h2>admin commands</h2>
<p>
	<code>flagsAdmin</code> installs a telegram-native ops surface for the flags <code>featureFlags()</code>
	added — list every flag, force a global override, or clear one, straight from a chat, gated by an
	<code>isAdmin</code> check you provide. no separate dashboard, and it works on every runtime yaebal
	supports (including edge/serverless).
</p>
<Code code={admin} title="bot.ts" />

<h2>external providers</h2>
<p>
	<code>provider</code> is consulted before the local catalog, for boolean flags only — a defined
	<code>true</code>/<code>false</code> wins, <code>undefined</code> falls through to local rules.
	a provider that throws is caught and treated as <code>undefined</code> (fail-open onto the local
	catalog) rather than taking the update down with it. all three adapters type their client
	structurally, so this package depends on no SDK.
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
			<td><code>(options: FeatureFlagsOptions&lt;F&gt;) =&gt; Plugin&lt;Context, {"{ flags: FlagsControl<F> }"}&gt;</code></td>
			<td>installs <code>ctx.flags</code>, typed against the catalog <code>F</code></td>
		</tr>
		<tr>
			<td><code>createFlags</code></td>
			<td><code>(options: FeatureFlagsOptions&lt;F&gt;) =&gt; Flags&lt;F&gt;</code></td>
			<td>standalone client, independent of any bot or <code>ctx</code></td>
		</tr>
		<tr>
			<td><code>flagGuard</code> / <code>variantGuard</code></td>
			<td><code>(key, value?) =&gt; (ctx) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>predicate for <code>bot.guard()</code></td>
		</tr>
		<tr>
			<td><code>whenFlag</code></td>
			<td><code>(key, build) =&gt; Plugin</code></td>
			<td>an isolated branch scoped to a boolean flag</td>
		</tr>
		<tr>
			<td><code>flagsAdmin</code></td>
			<td><code>(options: FlagsAdminOptions&lt;F&gt;) =&gt; Plugin</code></td>
			<td><code>/flags</code> ops commands, gated by <code>isAdmin</code></td>
		</tr>
		<tr>
			<td><code>bucketOf</code></td>
			<td><code>(input: string) =&gt; number</code></td>
			<td>deterministic <code>[0, 10000)</code> hash behind percentage/variant rollout</td>
		</tr>
		<tr>
			<td><code>launchDarklyAdapter</code></td>
			<td><code>(client: LaunchDarklyClientLike) =&gt; FlagProvider</code></td>
			<td>consult a LaunchDarkly server-side client</td>
		</tr>
		<tr>
			<td><code>growthBookAdapter</code></td>
			<td><code>(client, options?) =&gt; FlagProvider</code></td>
			<td>consult a GrowthBook client or per-evaluation client factory</td>
		</tr>
		<tr>
			<td><code>envProvider</code></td>
			<td><code>(options?: EnvProviderOptions) =&gt; FlagProvider</code></td>
			<td>read <code>FLAG_&lt;KEY&gt;</code> from <code>process.env</code></td>
		</tr>
	</tbody>
</table>

<h3>FlagsControl interface (ctx.flags)</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>isEnabled(key)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>override → global → provider → rules → default</td></tr>
		<tr><td><code>getVariant(key)</code></td><td><code>Promise&lt;T&gt;</code></td><td>override → global → rules → weighted pick, for a multivariate flag</td></tr>
		<tr><td><code>setOverride(key, value, options?)</code></td><td><code>Promise&lt;void&gt;</code></td><td>force <code>key</code> for the current bucket, optional <code>ttl</code></td></tr>
		<tr><td><code>clearOverride(key)</code></td><td><code>Promise&lt;void&gt;</code></td><td>remove the bucket override</td></tr>
		<tr><td><code>setGlobalOverride(key, value, options?)</code></td><td><code>Promise&lt;void&gt;</code></td><td>force <code>key</code> for every bucket</td></tr>
		<tr><td><code>clearGlobalOverride(key)</code></td><td><code>Promise&lt;void&gt;</code></td><td>remove the global override</td></tr>
		<tr><td><code>snapshot()</code></td><td><code>Promise&lt;Record&lt;string, unknown&gt;&gt;</code></td><td>evaluate the whole catalog at once, for the current bucket</td></tr>
	</tbody>
</table>

<h3>FeatureFlagsOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>flags</code></td><td><code>F extends FlagsCatalog</code></td><td>—</td><td>required. <code>boolean</code>, <code>FlagDefinition</code>, or <code>VariantDefinition</code> per key; validated up front (malformed rules/variants throw at construction, not on first use)</td></tr>
		<tr><td><code>storage</code></td><td><code>StorageAdapter&lt;unknown&gt;</code></td><td><code>MemoryStorage</code></td><td>where per-bucket and global overrides live — any <code>@yaebal/sklad</code> adapter</td></tr>
		<tr><td><code>provider</code></td><td><code>FlagProvider</code></td><td>—</td><td>external provider consulted before local rules, boolean flags only; errors fail open</td></tr>
		<tr><td><code>getContext</code></td><td><code>(ctx: Context) =&gt; FlagEvalContext</code></td><td>telegram's <code>from</code>/<code>chat</code> fields</td><td>derive the eval context (targeting fields, clock) for an update</td></tr>
		<tr><td><code>bucketKey</code></td><td><code>(evalContext) =&gt; string</code></td><td>per-user, falling back to per-chat</td><td>derive the bucket identity — feeds percentage/variant hashing <em>and</em> override storage, so they always agree</td></tr>
		<tr><td><code>onEvaluate</code></td><td><code>(event: EvaluationEvent&lt;F&gt;) =&gt; void</code></td><td>—</td><td>observe every evaluation's result and <code>source</code> — exposure logging, debugging</td></tr>
		<tr><td><code>onProviderError</code></td><td><code>(error, key) =&gt; void</code></td><td>—</td><td>observe a provider failure (evaluation still falls through to local rules)</td></tr>
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

<div class="note">
	<strong>no panel widget.</strong> <a href="/docs/plugins/panel/"><code>@yaebal/panel</code></a> is a
	chat-inbox ui without a plugin/widget extension point, so flag management ships as
	<code>flagsAdmin</code>'s bot commands instead of a panel page — it works with or without the panel
	installed.
</div>
