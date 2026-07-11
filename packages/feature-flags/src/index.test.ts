import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	bucketOf,
	createFlags,
	type FlagProvider,
	featureFlags,
	growthBookAdapter,
	launchDarklyAdapter,
} from "./index.js";

function botWith(flags: Parameters<typeof featureFlags>[0]) {
	return new Composer<Context>()
		.install(featureFlags(flags))
		.command("check", async (ctx) => ctx.reply(String(await ctx.flags.isEnabled("new-ui"))));
}

test("static boolean flag: on/off, no rules involved", async () => {
	const bot = botWith({ flags: { "new-ui": true } });
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("check");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");
});

test("unknown flag throws", async () => {
	const client = createFlags({ flags: { known: true } });
	await assert.rejects(() => client.isEnabled("unknown", {}), /unknown flag/);
});

test("percentage rollout is deterministic by bucket key", async () => {
	const client = createFlags({
		flags: { "new-ui": { default: false, rules: [{ percentage: 50 }] } },
	});

	const first = await client.isEnabled("new-ui", { userId: 1 });
	const again = await client.isEnabled("new-ui", { userId: 1 });
	assert.equal(first, again); // same bucket key → same answer every time

	// across many buckets, roughly half land enabled (deterministic hash, not random — exact split)
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

test("date-window rule gates by clock", async () => {
	const client = createFlags({
		flags: {
			seasonal: {
				default: false,
				rules: [{ from: new Date("2026-01-01"), to: new Date("2026-02-01") }],
			},
		},
	});

	assert.equal(await client.isEnabled("seasonal", { now: new Date("2025-12-31") }), false);
	assert.equal(await client.isEnabled("seasonal", { now: new Date("2026-01-15") }), true);
	assert.equal(await client.isEnabled("seasonal", { now: new Date("2026-02-01") }), false);
});

test("setOverride wins over local rules, clearOverride reverts", async () => {
	const client = createFlags({ flags: { "new-ui": false } });
	const evalContext = { userId: 1 };

	assert.equal(await client.isEnabled("new-ui", evalContext), false);

	await client.setOverride("new-ui", true, evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), true);

	await client.clearOverride("new-ui", evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), false);

	// a different bucket is unaffected by another bucket's override
	assert.equal(await client.isEnabled("new-ui", { userId: 2 }), false);
});

test("provider wins over local rules when it answers, falls through on undefined", async () => {
	const provider: FlagProvider = {
		isEnabled: (key) => (key === "new-ui" ? true : undefined),
	};
	const client = createFlags({
		flags: { "new-ui": false, other: { default: false, rules: [{ userIds: [1] }] } },
		provider,
	});

	assert.equal(await client.isEnabled("new-ui", {}), true); // provider overrides local `false`
	assert.equal(await client.isEnabled("other", { userId: 1 }), true); // provider defers, local rule matches
});

test("override wins over provider", async () => {
	const provider: FlagProvider = { isEnabled: () => true };
	const client = createFlags({ flags: { "new-ui": false }, provider });
	const evalContext = { userId: 1 };

	await client.setOverride("new-ui", false, evalContext);
	assert.equal(await client.isEnabled("new-ui", evalContext), false);
});

test("bucketOf is stable and spreads across the full range", () => {
	assert.equal(bucketOf("new-ui:1"), bucketOf("new-ui:1"));
	assert.ok(bucketOf("new-ui:1") >= 0 && bucketOf("new-ui:1") < 100);
	assert.notEqual(bucketOf("new-ui:1"), bucketOf("new-ui:2"));
});

test("launchDarklyAdapter delegates to client.variation with a user context", async () => {
	const calls: Array<{ key: string; context: unknown; defaultValue: boolean }> = [];
	const adapter = launchDarklyAdapter({
		variation: async (key, context, defaultValue) => {
			calls.push({ key, context, defaultValue });
			return key === "new-ui";
		},
	});

	assert.equal(await adapter.isEnabled("new-ui", { userId: 7 }), true);
	assert.deepEqual(calls[0]?.context, { kind: "user", key: "7" });
});

test("growthBookAdapter re-applies attributes before each check", async () => {
	const seenAttributes: Array<Record<string, unknown>> = [];
	let on = false;
	const adapter = growthBookAdapter(
		{
			isOn: (key) => key === "new-ui" && on,
			setAttributes: (attrs) => seenAttributes.push(attrs),
		},
		{ attributes: (evalContext) => ({ id: evalContext.userId }) },
	);

	on = true;
	assert.equal(await adapter.isEnabled("new-ui", { userId: 9 }), true);
	assert.deepEqual(seenAttributes, [{ id: 9 }]);
});

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
