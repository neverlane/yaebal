import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { Bot } from "@yaebal/core";
import { isReported, type SentryLike, type SentryScopeLike, sentry } from "./index.js";

interface FakeScope extends SentryScopeLike {
	tags: Record<string, unknown>;
	user: unknown;
	contexts: Record<string, unknown>;
	breadcrumbs: { category?: string; message?: string; level?: string }[];
}

/** what @sentry/node does: an isolation scope per callback that follows awaits. */
function fakeSentry() {
	const storage = new AsyncLocalStorage<FakeScope>();
	const captured: { exception: unknown; scope: FakeScope | undefined }[] = [];
	const sdk: SentryLike = {
		withIsolationScope(callback) {
			const scope: FakeScope = {
				tags: {},
				user: undefined,
				contexts: {},
				breadcrumbs: [],
				setTag(key, value) {
					this.tags[key] = value;
				},
				setUser(user) {
					this.user = user;
				},
				setContext(name, context) {
					this.contexts[name] = context;
				},
				setExtra() {},
			};
			return storage.run(scope, () => callback(scope));
		},
		captureException(exception) {
			captured.push({ exception, scope: storage.getStore() });
			return "event-id";
		},
		captureMessage() {
			return "event-id";
		},
		addBreadcrumb(breadcrumb) {
			storage.getStore()?.breadcrumbs.push(breadcrumb);
		},
	};
	return { sdk, captured };
}

const update = {
	update_id: 3,
	message: {
		message_id: 1,
		date: 0,
		chat: { id: 42, type: "private" },
		from: { id: 7, is_bot: false, first_name: "u", username: "neo" },
		text: "boom",
	},
};

test("a failing handler is captured with its update's scope, then reaches onError", {
	timeout: 5_000,
}, async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden" })),
	);
	const { sdk, captured } = fakeSentry();
	let seenByOnError: unknown;

	const bot = new Bot("123:test").install(sentry({ sentry: sdk, setUser: true }));
	bot.onError((error) => {
		seenByOnError = error;
	});
	bot.on("message", async (ctx) => {
		ctx.sentry.setTag("feature", "echo");
		await ctx.send("hi").catch(() => {}); // an api failure leaves an error breadcrumb
		throw new Error("handler broke");
	});
	await bot.handleUpdate(update as never);

	assert.equal(captured.length, 1);
	const scope = captured[0]?.scope;
	assert.equal(scope?.tags["telegram.update_type"], "message");
	assert.equal(scope?.tags.feature, "echo");
	assert.deepEqual(scope?.user, { id: 7, username: "neo" });
	assert.deepEqual(scope?.contexts.telegram, { update_id: 3, chat_id: 42 });
	assert.deepEqual(
		scope?.breadcrumbs.map((b) => `${b.category}:${b.message}`),
		["telegram.update:message", "telegram.api:sendMessage", "telegram.api:sendMessage failed"],
	);
	assert.ok(isReported(seenByOnError), "onError can tell the error was already reported");
});

test("users stay out of reports unless setUser is on", { timeout: 5_000 }, async () => {
	const { sdk, captured } = fakeSentry();
	const bot = new Bot("123:test").install(sentry({ sentry: sdk }));
	bot.onError(() => {});
	bot.on("message", () => {
		throw new Error("x");
	});
	await bot.handleUpdate(update as never);

	assert.equal(captured[0]?.scope?.user, undefined);
});
