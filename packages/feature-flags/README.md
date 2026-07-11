# @yaebal/feature-flags

`ctx.flags.isEnabled(key)` / `ctx.flags.getVariant(key)` — typed boolean and multivariate (A/B/n)
feature flags with persisted overrides via
[`@yaebal/sklad`](https://github.com/neverlane/yaebal/tree/main/packages/sklad), telegram-native
targeting (percentage, user/chat id, chat type, language, premium, date window), a kill switch,
`Composer`-integrated guards, telegram-native admin commands, and adapters for external providers
(LaunchDarkly, GrowthBook, plain env vars). evaluation order per check is **override → global
override → provider → local rules → default**. every flag key is typed against the catalog you
pass in — a typo'd key is a compile error, not a runtime surprise.

## install

```sh
pnpm add @yaebal/feature-flags
```

## usage

```ts
import { featureFlags } from "@yaebal/feature-flags";

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
});
```

`flags` is the catalog: a plain `boolean` for a static flag, a `FlagDefinition` for rollout rules,
or a `VariantDefinition` for a multivariate flag (see below). the bucket identity is per-user by
default (`ctx.from.id`, falling back to `ctx.chat.id`) — override with `bucketKey`; the eval
context (telegram targeting fields, clock) comes from `getContext`.

## rollout rules

```ts
featureFlags({
	flags: {
		"new-ui": {
			default: false,
			// rules are checked in order — the first match wins. within one rule, every
			// condition you set must hold (AND).
			rules: [
				{ percentage: 10 }, // 10% of buckets, deterministic per user
				{ userIds: [12345, "67890"] }, // always on for these users
				{ chatTypes: ["group", "supergroup"] }, // only in group chats
				{ languageCodes: ["ru", "uk"] }, // only for these telegram client languages
				{ premiumOnly: true }, // only for telegram premium users
				{ from: new Date("2026-03-01"), to: new Date("2026-04-01") }, // date window
			],
		},
		"legacy-mode": {
			default: true,
			// value: false carves out a kill-switch slice, even though the default is true
			rules: [{ userIds: [666], value: false }],
		},
	},
});
```

percentage rollout hashes `` `${key}:${bucketKey}` `` (fnv-1a, exported as `bucketOf` for testing)
— stable across restarts and processes, unlike `Math.random()`.

## multivariate flags

give a flag `variants` instead of a plain `default: boolean` and it becomes an A/B/n test:
`ctx.flags.getVariant(key)` returns one of the declared values, typed as their literal union. a
bucket's assignment is picked once, deterministically, from the same hash behind percentage
rollout — the same user always sees the same variant. `rules` on a variant flag force a specific
value outright (no on/off, just which one wins) rather than gating.

```ts
featureFlags({
	flags: {
		checkout: {
			default: "control",
			variants: [
				{ value: "control", weight: 50 },
				{ value: "v2", weight: 50 },
			],
			rules: [{ userIds: [42], value: "v2" }],
		},
	},
});

bot.command("checkout", async (ctx) => {
	const variant = await ctx.flags.getVariant("checkout"); // "control" | "v2", typed
	await ctx.reply(`checkout: ${variant}`);
});
```

## overrides

force a flag for one bucket — an admin command, a support workaround — persisted via `storage`
(defaults to in-memory, lost on restart). a per-bucket override always wins, even over a
configured provider. `setGlobalOverride` forces every bucket at once — a kill switch that needs no
redeploy — and both accept an optional `ttl` so the override expires on its own. overrides live
under their own `flags:`-prefixed keys, so sharing one `storage` adapter with `@yaebal/session` or
another yaebal plugin never collides.

```ts
import { redisStorage } from "@yaebal/sklad";

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

// later: await ctx.flags.clearOverride("new-ui"); / await ctx.flags.clearGlobalOverride("new-ui");
```

## guard & whenFlag

`flagGuard`/`variantGuard` plug straight into `bot.guard()` — but like any guard, they gate
everything registered *after* them in that composer, so where you call it matters. `whenFlag`
instead builds an isolated branch (the same primitive behind `Composer.filter`) — installing it
never gates a handler registered elsewhere on the same composer, regardless of order.

```ts
import { flagGuard, whenFlag } from "@yaebal/feature-flags";

// gates everything registered after it in *this* composer — order matters
bot.guard(flagGuard("new-ui")).command("beta-only", (ctx) => ctx.reply("new ui exclusive"));

// an isolated branch instead — doesn't matter where you install it, and it never
// gates a sibling handler registered elsewhere on the same composer
bot.install(
	whenFlag("new-ui", (branch) => branch.command("beta-only", (ctx) => ctx.reply("new ui exclusive"))),
);
```

## admin commands

`flagsAdmin` installs a telegram-native ops surface for the flags `featureFlags()` added — list
every flag, force a global override, or clear one, straight from a chat, gated by an `isAdmin`
check you provide. no separate dashboard, and it works on every runtime yaebal supports (including
edge/serverless).

```ts
import { flagsAdmin } from "@yaebal/feature-flags";

bot.install(flagsAdmin({ isAdmin: (ctx) => ctx.from?.id === OWNER_ID }));

// /flags                      — every flag's value for your own bucket
// /flags set new-ui true      — global override (parses true/false, numbers, or a string)
// /flags clear new-ui         — remove the global override
```

## external providers

`provider` is consulted before the local catalog, for boolean flags only — a defined
`true`/`false` wins, `undefined` falls through to local rules. a provider that throws is caught
and treated as `undefined` (fail-open onto the local catalog) rather than taking the update down
with it:

```ts
import { envProvider, growthBookAdapter, launchDarklyAdapter } from "@yaebal/feature-flags";

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
bot.install(featureFlags({ flags: { "new-ui": false }, provider: envProvider() }));
```

all three adapters type their client structurally — this package depends on no SDK.

## standalone use

`createFlags(options)` builds a client independent of any bot or `ctx` — same shape as
`ctx.flags`, plus an explicit `evalContext` per call:

```ts
import { createFlags } from "@yaebal/feature-flags";

const flags = createFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } });
await flags.isEnabled("new-ui", { userId: 42 });
```

## api

- `featureFlags(options)` — installs `ctx.flags`, typed against the catalog you pass in.
- `createFlags(options)` — standalone client (`isEnabled`/`getVariant`/`setOverride`/
  `clearOverride`/`setGlobalOverride`/`clearGlobalOverride`/`snapshot`, all taking an explicit
  `FlagEvalContext` where relevant).
- `flagGuard(key)` / `variantGuard(key, value)` — predicates for `bot.guard()`.
- `whenFlag(key, build)` — an isolated branch scoped to a boolean flag.
- `flagsAdmin(options)` — `/flags` ops commands, gated by `isAdmin`.
- `bucketOf(input)` — the deterministic `[0, 10000)` hash behind percentage/variant rollout.
- `launchDarklyAdapter(client)` / `growthBookAdapter(client, options?)` / `envProvider(options?)` —
  `FlagProvider` adapters.

## testing

```ts
import { createTestEnv } from "@yaebal/test";
import { featureFlags } from "@yaebal/feature-flags";

const bot = new Composer<Context>()
	.install(featureFlags({ flags: { "new-ui": { default: false, rules: [{ userIds: [1] }] } } }))
	.command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("new-ui"))));

const env = createTestEnv(bot);
await env.createUser({ id: 1 }).sendCommand("check"); // "true" — id 1 is targeted
await env.createUser({ id: 2 }).sendCommand("check"); // "false"
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
