import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import type { StorageAdapter } from "@yaebal/sklad";
import { createTestEnv } from "@yaebal/test";
import {
	bucketOf,
	createFlags,
	envProvider,
	type FlagProvider,
	featureFlags,
	flagGuard,
	flagsAdmin,
	growthBookAdapter,
	launchDarklyAdapter,
	OverrideStore,
	variantGuard,
	whenFlag,
} from "./index.js";

function botWith(flags: Parameters<typeof featureFlags>[0]) {
	return new Composer<Context>()
		.install(featureFlags(flags))
		.command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("new-ui"))));
}

// ── local evaluation: boolean flags ────────────────────────────────────────

test("static boolean flag: on/off, no rules involved", async () => {
	const bot = botWith({ flags: { "new-ui": true } });
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");
});

test("unknown flag throws — isEnabled and getVariant", async () => {
	const client = createFlags({ flags: { known: true } });
	await assert.rejects(() => client.isEnabled("unknown" as never, {}), /unknown flag/);
	await assert.rejects(() => client.getVariant("unknown" as never, {}), /unknown flag/);
});

test("isEnabled rejects a multivariate flag; getVariant rejects a boolean flag", async () => {
	const client = createFlags({
		flags: { checkout: { default: "a", variants: [{ value: "a", weight: 1 }] }, "new-ui": false },
	});
	await assert.rejects(
		() => client.isEnabled("checkout" as never, {}),
		/multivariate flag.*getVariant/,
	);
	await assert.rejects(
		() => client.getVariant("new-ui" as never, {}),
		/not a multivariate flag.*isEnabled/,
	);
});

test("percentage rollout is deterministic by bucket key", async () => {
	const client = createFlags({
		flags: { "new-ui": { default: false, rules: [{ percentage: 50 }] } },
	});

	const first = await client.isEnabled("new-ui", { userId: 1 });
	const again = await client.isEnabled("new-ui", { userId: 1 });
	assert.equal(first, again);

	let enabled = 0;
	for (let id = 0; id < 1000; id++) {
		if (await client.isEnabled("new-ui", { userId: id })) enabled++;
	}
	assert.ok(enabled > 400 && enabled < 600, `expected ~500/1000 enabled, got ${enabled}`);
});

test("userIds rule targets specific users only", async () => {
	const client = createFlags({
		flags: { beta: { default: false, rules: [{ userIds: [42] }] } },
	});

	assert.equal(await client.isEnabled("beta", { userId: 42 }), true);
	assert.equal(await client.isEnabled("beta", { userId: 7 }), false);
});

test("chatIds rule targets specific chats", async () => {
	const client = createFlags({
		flags: { announce: { default: false, rules: [{ chatIds: [-1001] }] } },
	});

	assert.equal(await client.isEnabled("announce", { chatId: -1001 }), true);
	assert.equal(await client.isEnabled("announce", { chatId: -1002 }), false);
});

test("languageCodes rule targets the telegram client language", async () => {
	const client = createFlags({
		flags: { ru: { default: false, rules: [{ languageCodes: ["ru", "uk"] }] } },
	});

	assert.equal(await client.isEnabled("ru", { languageCode: "ru" }), true);
	assert.equal(await client.isEnabled("ru", { languageCode: "en" }), false);
	assert.equal(await client.isEnabled("ru", {}), false);
});

test("premiumOnly rule targets telegram premium users", async () => {
	const client = createFlags({
		flags: { vip: { default: false, rules: [{ premiumOnly: true }] } },
	});

	assert.equal(await client.isEnabled("vip", { isPremium: true }), true);
	assert.equal(await client.isEnabled("vip", { isPremium: false }), false);
	assert.equal(await client.isEnabled("vip", {}), false);
});

test("all conditions on one rule must hold (AND) — a matching percentage alone isn't enough", async () => {
	const client = createFlags({
		flags: { "new-ui": { default: false, rules: [{ percentage: 100, chatTypes: ["group"] }] } },
	});

	assert.equal(await client.isEnabled("new-ui", { userId: 1, chatType: "private" }), false);
	assert.equal(await client.isEnabled("new-ui", { userId: 1, chatType: "group" }), true);
});

test("date-window rule gates by clock and accepts string/number dates, not just Date objects", async () => {
	const client = createFlags({
		flags: {
			seasonal: {
				default: false,
				rules: [{ from: "2026-01-01", to: new Date("2026-02-01").getTime() }],
			},
		},
	});

	assert.equal(await client.isEnabled("seasonal", { now: new Date("2025-12-31") }), false);
	assert.equal(await client.isEnabled("seasonal", { now: new Date("2026-01-15") }), true);
	assert.equal(await client.isEnabled("seasonal", { now: new Date("2026-02-01") }), false);
});

test("kill-switch rule (value: false) carves out a slice even when default is true", async () => {
	const client = createFlags({
		flags: { "legacy-mode": { default: true, rules: [{ userIds: [666], value: false }] } },
	});

	assert.equal(await client.isEnabled("legacy-mode", { userId: 1 }), true);
	assert.equal(await client.isEnabled("legacy-mode", { userId: 666 }), false);
});

test("rules are checked in order — the first match wins", async () => {
	const client = createFlags({
		flags: {
			f: {
				default: false,
				rules: [
					{ userIds: [1], value: true },
					{ userIds: [1], value: false },
				],
			},
		},
	});

	assert.equal(await client.isEnabled("f", { userId: 1 }), true);
});

// ── catalog validation ──────────────────────────────────────────────────────

test("validateCatalog rejects malformed rules at construction time, not on first use", () => {
	assert.throws(
		() => createFlags({ flags: { f: { default: false, rules: [{ percentage: 150 }] } } }),
		/percentage/,
	);
	assert.throws(
		() => createFlags({ flags: { f: { default: false, rules: [{}] } } }),
		/no condition set/,
	);
	assert.throws(
		() =>
			createFlags({
				flags: {
					f: {
						default: false,
						rules: [{ from: new Date("2026-02-01"), to: new Date("2026-01-01") }],
					},
				},
			}),
		/at\/after/,
	);
});

test("validateCatalog rejects malformed variants at construction time", () => {
	assert.throws(
		() =>
			createFlags({
				flags: {
					f: {
						default: "a",
						variants: [
							{ value: "a", weight: 0 },
							{ value: "b", weight: 0 },
						],
					},
				},
			}),
		/weigh 0/,
	);
	assert.throws(
		() => createFlags({ flags: { f: { default: "a", variants: [{ value: "a", weight: -1 }] } } }),
		/invalid weight/,
	);
	assert.throws(
		() => createFlags({ flags: { f: { default: "z", variants: [{ value: "a", weight: 1 }] } } }),
		/is not among its `variants`/,
	);
	assert.throws(
		() =>
			createFlags({
				flags: {
					f: { default: "a", variants: [{ value: "a", weight: 1 }], rules: [{ value: "a" }] },
				},
			}),
		/no condition set/,
	);
});

// ── multivariate flags ──────────────────────────────────────────────────────

test("multivariate flag: deterministic pick + distribution matches weights", async () => {
	const client = createFlags({
		flags: {
			checkout: {
				default: "control",
				variants: [
					{ value: "control", weight: 50 },
					{ value: "v2", weight: 50 },
				],
			},
		},
	});

	const first = await client.getVariant("checkout", { userId: 1 });
	const again = await client.getVariant("checkout", { userId: 1 });
	assert.equal(first, again);

	const counts: Record<string, number> = {};
	for (let id = 0; id < 1000; id++) {
		const v = String(await client.getVariant("checkout", { userId: id }));
		counts[v] = (counts[v] ?? 0) + 1;
	}
	assert.ok((counts.control ?? 0) > 400 && (counts.control ?? 0) < 600, JSON.stringify(counts));
	assert.ok((counts.v2 ?? 0) > 400 && (counts.v2 ?? 0) < 600, JSON.stringify(counts));
});

test("multivariate flag: a matching VariantRule forces its value over the weighted pick", async () => {
	const client = createFlags({
		flags: {
			checkout: {
				default: "control",
				variants: [
					{ value: "control", weight: 50 },
					{ value: "v2", weight: 50 },
				],
				rules: [{ userIds: [7], value: "v2" }],
			},
		},
	});

	assert.equal(await client.getVariant("checkout", { userId: 7 }), "v2");
});

// ── overrides ────────────────────────────────────────────────────────────

test("setOverride wins over local rules, clearOverride reverts", async () => {
	const client = createFlags({ flags: { "new-ui": false } });
	const evalContext = { userId: 1 };

	assert.equal(await client.isEnabled("new-ui", evalContext), false);

	await client.setOverride("new-ui", true, evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), true);

	await client.clearOverride("new-ui", evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), false);

	assert.equal(await client.isEnabled("new-ui", { userId: 2 }), false);
});

test("override bucket is unified with the percentage bucket — same user, private chat vs group", async () => {
	const client = createFlags({ flags: { "new-ui": false } });

	await client.setOverride("new-ui", true, { userId: 42, chatId: 42 });
	assert.equal(await client.isEnabled("new-ui", { userId: 42, chatId: 42 }), true);
	// same user, now writing from a group chat — still the same (per-user) bucket
	assert.equal(await client.isEnabled("new-ui", { userId: 42, chatId: -100123 }), true);
});

test("clearOverride deletes the underlying key outright — no empty record left behind", async () => {
	const raw = new Map<string, unknown>();
	const storage: StorageAdapter<unknown> = {
		get: (key) => raw.get(key),
		set: (key, value) => void raw.set(key, value),
		delete: (key) => void raw.delete(key),
	};
	const client = createFlags({ flags: { "new-ui": false }, storage });

	await client.setOverride("new-ui", true, { userId: 1 });
	assert.equal(raw.size, 1);

	await client.clearOverride("new-ui", { userId: 1 });
	assert.equal(raw.size, 0);
});

test("global override applies to every bucket; a per-bucket override still wins over it", async () => {
	const client = createFlags({ flags: { "new-ui": false } });

	await client.setGlobalOverride("new-ui", true);
	assert.equal(await client.isEnabled("new-ui", { userId: 1 }), true);
	assert.equal(await client.isEnabled("new-ui", { userId: 2 }), true);

	await client.setOverride("new-ui", false, { userId: 1 });
	assert.equal(await client.isEnabled("new-ui", { userId: 1 }), false);
	assert.equal(await client.isEnabled("new-ui", { userId: 2 }), true);

	await client.clearGlobalOverride("new-ui");
	assert.equal(await client.isEnabled("new-ui", { userId: 2 }), false);
});

test("setOverride/setGlobalOverride/clearOverride/clearGlobalOverride reject an unknown flag key", async () => {
	const client = createFlags({ flags: { known: true } });
	await assert.rejects(() => client.setOverride("nope" as never, true, {}), /unknown flag/);
	await assert.rejects(() => client.setGlobalOverride("nope" as never, true), /unknown flag/);
	await assert.rejects(() => client.clearOverride("nope" as never, {}), /unknown flag/);
	await assert.rejects(() => client.clearGlobalOverride("nope" as never), /unknown flag/);
});

test("override ttl expires, checked lazily on read (OverrideStore, injected clock)", {
	timeout: 5_000,
}, async () => {
	let now = 1_000;
	const raw = new Map<string, unknown>();
	const storage: StorageAdapter<unknown> = {
		get: (key) => raw.get(key),
		set: (key, value) => void raw.set(key, value),
		delete: (key) => void raw.delete(key),
	};
	const store = new OverrideStore(storage, () => now);

	await store.setOverride("user:1", "new-ui", true, { ttl: 500 });
	assert.deepEqual(await store.getOverride("user:1", "new-ui"), { value: true });

	now += 600;
	assert.equal(await store.getOverride("user:1", "new-ui"), undefined);
	assert.equal(raw.size, 0);
});

// ── providers: precedence + fail-open ───────────────────────────────────────

test("provider wins over local rules when it answers, falls through on undefined", async () => {
	const provider: FlagProvider = {
		isEnabled: (key) => (key === "new-ui" ? true : undefined),
	};
	const client = createFlags({
		flags: { "new-ui": false, other: { default: false, rules: [{ userIds: [1] }] } },
		provider,
	});

	assert.equal(await client.isEnabled("new-ui", {}), true);
	assert.equal(await client.isEnabled("other", { userId: 1 }), true);
});

test("override wins over provider", async () => {
	const provider: FlagProvider = { isEnabled: () => true };
	const client = createFlags({ flags: { "new-ui": false }, provider });
	const evalContext = { userId: 1 };

	await client.setOverride("new-ui", false, evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), false);
});

test("a throwing provider fails open to local rules, and onProviderError observes it", async () => {
	const errors: Array<{ key: string }> = [];
	const provider: FlagProvider = {
		isEnabled: () => {
			throw new Error("network blip");
		},
	};
	const client = createFlags({
		flags: { "new-ui": { default: false, rules: [{ userIds: [1] }] } },
		provider,
		onProviderError: (_error, key) => errors.push({ key }),
	});

	assert.equal(await client.isEnabled("new-ui", { userId: 1 }), true);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.key, "new-ui");
});

// ── onEvaluate / snapshot ───────────────────────────────────────────────────

test("onEvaluate reports the source that decided each evaluation", async () => {
	const events: Array<{ key: string; source: string }> = [];
	const client = createFlags({
		flags: { "new-ui": { default: false, rules: [{ userIds: [1] }] } },
		onEvaluate: (e) => events.push({ key: e.key, source: e.source }),
	});

	await client.isEnabled("new-ui", { userId: 1 }); // rule
	await client.isEnabled("new-ui", { userId: 2 }); // default
	await client.setOverride("new-ui", true, { userId: 2 });
	await client.isEnabled("new-ui", { userId: 2 }); // override
	await client.clearOverride("new-ui", { userId: 2 });
	await client.setGlobalOverride("new-ui", true);
	await client.isEnabled("new-ui", { userId: 2 }); // global

	assert.deepEqual(
		events.map((e) => e.source),
		["rule", "default", "override", "global"],
	);
});

test("snapshot evaluates every flag in the catalog at once", async () => {
	const client = createFlags({
		flags: {
			a: true,
			b: { default: false, rules: [{ userIds: [1] }] },
			c: { default: "x", variants: [{ value: "x", weight: 1 }] },
		},
	});

	assert.deepEqual(await client.snapshot({ userId: 1 }), { a: true, b: true, c: "x" });
});

// ── bucketOf ─────────────────────────────────────────────────────────────

test("bucketOf is stable and spreads across the full [0, 10000) range", () => {
	assert.equal(bucketOf("new-ui:1"), bucketOf("new-ui:1"));
	assert.ok(bucketOf("new-ui:1") >= 0 && bucketOf("new-ui:1") < 10_000);
	assert.notEqual(bucketOf("new-ui:1"), bucketOf("new-ui:2"));
});

// ── external providers ───────────────────────────────────────────────────

test("launchDarklyAdapter is authoritative once LaunchDarkly has a real answer", async () => {
	const adapter = launchDarklyAdapter({
		variationDetail: async (key) => ({ value: key === "new-ui", reason: { kind: "FALLTHROUGH" } }),
	});

	assert.equal(await adapter.isEnabled("new-ui", { userId: 7 }), true);
	assert.equal(await adapter.isEnabled("other", { userId: 7 }), false);
});

test("launchDarklyAdapter defers to local rules when LD doesn't know the flag or isn't ready", async () => {
	const notFound = launchDarklyAdapter({
		variationDetail: async () => ({
			value: false,
			reason: { kind: "ERROR", errorKind: "FLAG_NOT_FOUND" },
		}),
	});
	assert.equal(await notFound.isEnabled("new-ui", { userId: 1 }), undefined);

	const notReady = launchDarklyAdapter({
		variationDetail: async () => ({
			value: false,
			reason: { kind: "ERROR", errorKind: "CLIENT_NOT_READY" },
		}),
	});
	assert.equal(await notReady.isEnabled("new-ui", { userId: 1 }), undefined);
});

test("growthBookAdapter (shared client) re-applies attributes before each check", async () => {
	const seenAttributes: Array<Record<string, unknown>> = [];
	let on = false;
	const adapter = growthBookAdapter(
		{
			evalFeature: (key) => ({
				value: key === "new-ui" && on,
				source: on ? "force" : "defaultValue",
			}),
			setAttributes: (attrs) => seenAttributes.push(attrs),
		},
		{ attributes: (evalContext) => ({ id: evalContext.userId }) },
	);

	on = true;
	assert.equal(await adapter.isEnabled("new-ui", { userId: 9 }), true);
	assert.deepEqual(seenAttributes, [{ id: 9 }]);
});

test("growthBookAdapter (factory) builds a client per evaluation — no shared mutable state", async () => {
	const adapter = growthBookAdapter((evalContext) => ({
		evalFeature: (key) => ({
			value: key === "new-ui" && evalContext.userId === 9,
			source: "force",
		}),
	}));

	const [a, b] = await Promise.all([
		adapter.isEnabled("new-ui", { userId: 9 }),
		adapter.isEnabled("new-ui", { userId: 1 }),
	]);
	assert.equal(a, true);
	assert.equal(b, false);
});

test("growthBookAdapter defers to local rules for a feature it's never heard of", async () => {
	const adapter = growthBookAdapter({
		evalFeature: () => ({ value: false, source: "unknownFeature" }),
	});
	assert.equal(await adapter.isEnabled("new-ui", {}), undefined);
});

test("envProvider reads FLAG_<KEY> from the environment", async () => {
	const provider = envProvider({
		env: { FLAG_NEW_UI: "true", FLAG_OLD_UI: "0", FLAG_WEIRD: "maybe" },
	});

	assert.equal(await provider.isEnabled("new-ui", {}), true);
	assert.equal(await provider.isEnabled("old-ui", {}), false);
	assert.equal(await provider.isEnabled("weird", {}), undefined);
	assert.equal(await provider.isEnabled("unset", {}), undefined);
});

test("envProvider supports a custom prefix", async () => {
	const provider = envProvider({ env: { MYAPP_BETA: "on" }, prefix: "MYAPP_" });
	assert.equal(await provider.isEnabled("beta", {}), true);
});

// ── ctx.flags end to end ───────────────────────────────────────────────────

test("ctx.flags.isEnabled reads per-user bucket end to end", async () => {
	const bot = botWith({
		flags: { "new-ui": { default: false, rules: [{ userIds: [1] }] } },
	});
	const env = createTestEnv(bot);

	await env.createUser({ id: 1 }).sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");

	await env.createUser({ id: 2 }).sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "false");
});

test("ctx.flags.getVariant reads per-user bucket end to end", async () => {
	const bot = new Composer<Context>()
		.install(
			featureFlags({
				flags: {
					checkout: {
						default: "control",
						variants: [
							{ value: "control", weight: 1 },
							{ value: "v2", weight: 1 },
						],
						rules: [{ userIds: [1], value: "v2" }],
					},
				},
			}),
		)
		.command("check", async (ctx) => ctx.reply(String(await ctx.flags.getVariant("checkout"))));
	const env = createTestEnv(bot);

	await env.createUser({ id: 1 }).sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "v2");
});

test("defaultContext wires chat type and language from telegram fields", async () => {
	const bot = new Composer<Context>()
		.install(
			featureFlags({
				flags: {
					"group-only": {
						default: false,
						rules: [{ chatTypes: ["group"], languageCodes: ["ru"] }],
					},
				},
			}),
		)
		.command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("group-only"))));
	const env = createTestEnv(bot);
	const group = env.createChat({ type: "group" });

	await env.createUser({ languageCode: "ru" }).sendCommand(group, "check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");

	env.clearApiCalls();
	await env.createUser({ languageCode: "en" }).sendCommand(group, "check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "false");
});

// ── guard/whenFlag composer integration ─────────────────────────────────────

test("flagGuard gates everything registered after it in the same composer", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { beta: { default: false, rules: [{ userIds: [1] }] } } }))
		.guard(flagGuard("beta"))
		.command("secret", async (ctx) => ctx.reply("shh"));
	const env = createTestEnv(bot);

	await env.createUser({ id: 1 }).sendCommand("secret");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "shh");

	env.clearApiCalls();
	await env.createUser({ id: 2 }).sendCommand("secret");
	assert.equal(env.lastApiCall("sendMessage"), undefined);
});

test("variantGuard gates on a specific multivariate outcome", async () => {
	const bot = new Composer<Context>()
		.install(
			featureFlags({
				flags: {
					checkout: {
						default: "control",
						variants: [
							{ value: "control", weight: 1 },
							{ value: "v2", weight: 1 },
						],
						rules: [{ userIds: [1], value: "v2" }],
					},
				},
			}),
		)
		.guard(variantGuard("checkout", "v2"))
		.command("newcheckout", (ctx) => ctx.reply("v2 flow"));
	const env = createTestEnv(bot);

	await env.createUser({ id: 1 }).sendCommand("newcheckout");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "v2 flow");

	env.clearApiCalls();
	await env.createUser({ id: 2 }).sendCommand("newcheckout");
	assert.equal(env.lastApiCall("sendMessage"), undefined);
});

test("whenFlag scopes a branch without gating handlers registered elsewhere on the composer", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { beta: { default: false, rules: [{ userIds: [1] }] } } }))
		.install(whenFlag("beta", (branch) => branch.command("secret", (ctx) => ctx.reply("shh"))))
		.command("open", (ctx) => ctx.reply("always"));
	const env = createTestEnv(bot);

	await env.createUser({ id: 2 }).sendCommand("open");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "always");

	env.clearApiCalls();
	await env.createUser({ id: 2 }).sendCommand("secret");
	assert.equal(env.lastApiCall("sendMessage"), undefined);

	env.clearApiCalls();
	await env.createUser({ id: 1 }).sendCommand("secret");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "shh");
});

// ── flagsAdmin ───────────────────────────────────────────────────────────

test("flagsAdmin: /flags lists a snapshot for the caller's bucket", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { "new-ui": true, maintenance: false } }))
		.install(flagsAdmin({ isAdmin: () => true }));
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("flags");
	const text = String(env.lastApiCall("sendMessage")?.params?.text);
	assert.match(text, /new-ui: true/);
	assert.match(text, /maintenance: false/);
});

test("flagsAdmin: set/clear manage the global override", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { "new-ui": false } }))
		.install(flagsAdmin({ isAdmin: () => true }))
		.command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("new-ui"))));
	const env = createTestEnv(bot);

	await env.createUser({ id: 1 }).sendCommand("flags", "set new-ui true");
	await env.createUser({ id: 2 }).sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");

	env.clearApiCalls();
	await env.createUser({ id: 1 }).sendCommand("flags", "clear new-ui");
	await env.createUser({ id: 2 }).sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "false");
});

test("flagsAdmin: isAdmin gates the command", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { "new-ui": false } }))
		.install(flagsAdmin({ isAdmin: (ctx) => ctx.from?.id === 1 }));
	const env = createTestEnv(bot);

	await env.createUser({ id: 2 }).sendCommand("flags");
	assert.equal(env.lastApiCall("sendMessage"), undefined);

	env.clearApiCalls();
	await env.createUser({ id: 1 }).sendCommand("flags");
	assert.ok(env.lastApiCall("sendMessage"));
});

test("flagsAdmin doesn't gate handlers registered elsewhere on the composer", async () => {
	const bot = new Composer<Context>()
		.install(featureFlags({ flags: { "new-ui": false } }))
		.install(flagsAdmin({ isAdmin: () => false }))
		.command("open", (ctx) => ctx.reply("always"));
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("open");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "always");
});

// ── typed keys ───────────────────────────────────────────────────────────

test("typed keys: a typo'd flag key doesn't typecheck (enforced by `pnpm typecheck`)", async () => {
	const client = createFlags({ flags: { "new-ui": true } });
	// @ts-expect-error — "new-uii" isn't a key of the catalog above; still rejects at runtime too
	await assert.rejects(() => client.isEnabled("new-uii", {}), /unknown flag/);
});
