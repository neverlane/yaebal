import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { auditAdmin } from "./admin.js";
import { createAuditLogger } from "./logger.js";

function setup(isAdmin: (ctx: Context) => boolean) {
	const logger = createAuditLogger({ sinks: [{ write() {} }] });
	const bot = new Composer<Context>().install(auditAdmin({ logger, isAdmin }));
	const env = createTestEnv(bot);
	return { env, logger };
}

test("/audit replies with the logger's stats for an admin", async () => {
	const { env, logger } = setup(() => true);
	logger.log({
		kind: "api.call",
		level: "info",
		timestamp: 1,
		callId: "c1",
		method: "sendMessage",
		params: undefined,
		attempt: 1,
	});

	await env.createUser().sendMessage("/audit");

	const reply = env.lastBotMessage();
	assert.ok(reply?.text?.includes("received: 1"));
	assert.ok(reply?.text?.includes("written: 1"));
});

test("/audit flush calls logger.flush() and confirms", async () => {
	let flushed = false;
	const bot = new Composer<Context>().install(
		auditAdmin({
			logger: {
				stats: () => ({
					received: 0,
					filtered: 0,
					sampledOut: 0,
					written: 0,
					errors: { filter: 0, sample: 0, redact: 0, format: 0, sink: 0, flush: 0 },
				}),
				flush: async () => {
					flushed = true;
				},
			},
			isAdmin: () => true,
		}),
	);
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("/audit flush");

	assert.equal(flushed, true);
	assert.equal(env.lastBotMessage()?.text, "flushed.");
});

test("a rejected isAdmin check continues the outer chain instead of halting it", async () => {
	const logger = createAuditLogger({ sinks: [{ write() {} }] });
	const seen: string[] = [];
	const bot = new Composer<Context>()
		.install(auditAdmin({ logger, isAdmin: () => false }))
		.on("message", (ctx) => {
			seen.push(ctx.text ?? "");
		});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("/audit");

	assert.equal(env.lastBotMessage(), undefined);
	assert.deepEqual(seen, ["/audit"]);
});
