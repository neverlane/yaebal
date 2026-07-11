# @yaebal/feature-flags

`ctx.flags.isEnabled(key)` — feature flags with persisted overrides via
[`@yaebal/sklad`](https://github.com/neverlane/yaebal/tree/main/packages/sklad), percentage /
user-id / date-window rollout rules, and adapters for external providers (LaunchDarkly,
GrowthBook). evaluation order per check is **override → provider → local rules → default**.

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

`flags` is the catalog: a plain `boolean` for a static flag, or a `FlagDefinition` for rollout
rules. the bucket key is per-user by default (`ctx.from.id`, falling back to `ctx.chat.id`) —
override with `getContext`.

## rollout rules

```ts
featureFlags({
	flags: {
		"new-ui": {
			default: false,
			// ANY rule enables the flag (OR). within one rule, all set conditions must hold (AND).
			rules: [
				{ percentage: 10 }, // 10% of buckets, deterministic — the same user always gets the same answer
				{ userIds: [12345, "67890"] }, // always on for these users
				{ from: new Date("2026-03-01"), to: new Date("2026-04-01") }, // date window
			],
		},
	},
});
```

percentage rollout hashes `` `${key}:${bucketKey}` `` (fnv-1a, exported as `bucketOf` for testing)
— stable across restarts and processes, unlike `Math.random()`.

## overrides

force a flag for one bucket — an admin panel toggle, a support workaround — persisted via
`storage` (defaults to in-memory, lost on restart):

```ts
import { redisStorage } from "@yaebal/sklad";

bot.install(featureFlags({ flags: { "new-ui": false }, storage: redisStorage(client) }));

bot.command("beta", async (ctx) => {
	await ctx.flags.setOverride("new-ui", true); // wins over provider and local rules
	await ctx.reply("you're in!");
});

// later: await ctx.flags.clearOverride("new-ui");
```

## external providers

`provider` is consulted before the local catalog — a defined `true`/`false` wins, `undefined`
falls through to local rules:

```ts
import { growthBookAdapter, launchDarklyAdapter } from "@yaebal/feature-flags";

// LaunchDarkly — any client satisfying `{ variation(key, context, defaultValue) }`
bot.install(featureFlags({ flags: { "new-ui": false }, provider: launchDarklyAdapter(ldClient) }));

// GrowthBook — attributes are re-applied before every check, since GrowthBook targeting reads
// whatever's currently set on the client rather than taking a context per call
bot.install(
	featureFlags({
		flags: { "new-ui": false },
		provider: growthBookAdapter(gbClient, { attributes: (ctx) => ({ id: ctx.userId }) }),
	}),
);
```

both adapters type the client structurally (`LaunchDarklyClientLike`/`GrowthBookClientLike`) —
this package depends on neither SDK.

## standalone use

`createFlags(options)` builds a client independent of any bot or `ctx` — same shape as
`ctx.flags`, plus an explicit `evalContext` per call:

```ts
import { createFlags } from "@yaebal/feature-flags";

const flags = createFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } });
await flags.isEnabled("new-ui", { userId: 42 });
```

## api

- `featureFlags(options)` — installs `ctx.flags` on the bot.
- `createFlags(options)` — standalone client (`isEnabled`/`setOverride`/`clearOverride`, all
  taking an explicit `FlagEvalContext`).
- `bucketOf(input)` — the deterministic `[0, 100)` hash behind percentage rollout.
- `launchDarklyAdapter(client)` / `growthBookAdapter(client, options?)` — `FlagProvider` adapters.

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
