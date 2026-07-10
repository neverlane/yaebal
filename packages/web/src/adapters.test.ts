import assert from "node:assert/strict";
import test from "node:test";
import {
	awsLambdaAdapter,
	azureAdapter,
	cloudflareAdapter,
	elysiaAdapter,
	expressAdapter,
	fastifyAdapter,
	honoAdapter,
	koaAdapter,
	nextAdapter,
	svelteKitAdapter,
} from "./adapters.js";

const update = {
	update_id: 1,
	message: { message_id: 1, date: 0, chat: { id: 5, type: "private" }, text: "hi" },
};
const body = JSON.stringify(update);

function sink() {
	const seen: number[] = [];
	return {
		bot: { handleUpdate: async (u: { update_id: number }) => void seen.push(u.update_id) },
		seen,
	};
}

test("expressAdapter reads a parsed body and answers via statusCode/end", async () => {
	const { bot, seen } = sink();
	const handler = expressAdapter(bot);

	let status = 0;
	let ended = "";
	const headers: Record<string, string> = {};
	await handler({ method: "POST", url: "/", headers: { host: "x" }, body: update }, {
		set statusCode(v: number) {
			status = v;
		},
		setHeader: (k: string, v: string) => {
			headers[k] = v;
		},
		end: (b?: string) => {
			ended = b ?? "";
		},
	} as never);

	assert.deepEqual(seen, [1]);
	assert.equal(status, 200);
	assert.equal(ended, "ok");
});

test("expressAdapter consumes a raw node stream when there is no parsed body", async () => {
	const { bot, seen } = sink();
	const handler = expressAdapter(bot);

	// a minimal IncomingMessage: emits data/end via .on()
	const listeners: Record<string, ((arg: unknown) => void)[]> = {};
	const req = {
		method: "POST",
		url: "/",
		headers: { host: "x" },
		on(event: string, cb: (arg: unknown) => void) {
			const list = listeners[event] ?? [];
			listeners[event] = list;
			list.push(cb);
		},
	};

	const done = handler(req as never, { setHeader() {}, end() {} } as never);
	for (const cb of listeners.data ?? []) cb(new TextEncoder().encode(body));
	for (const cb of listeners.end ?? []) cb(undefined);
	await done;

	assert.deepEqual(seen, [1]);
});

test("fastifyAdapter answers via reply.code/header/send", async () => {
	const { bot, seen } = sink();
	const handler = fastifyAdapter(bot);

	let status = 0;
	let sent = "";
	const reply = {
		code(s: number) {
			status = s;
			return reply;
		},
		header() {
			return reply;
		},
		send: (p: string) => {
			sent = p;
		},
	};

	await handler({ method: "POST", url: "/", headers: {}, body: update } as never, reply as never);
	assert.deepEqual(seen, [1]);
	assert.equal(status, 200);
	assert.equal(sent, "ok");
});

test("koaAdapter sets ctx.status and ctx.body", async () => {
	const { bot, seen } = sink();
	const handler = koaAdapter(bot);

	const ctx = {
		method: "POST",
		url: "/",
		headers: {},
		request: { body: update },
		status: 0,
		body: undefined as unknown,
		set() {},
	};

	await handler(ctx as never);
	assert.deepEqual(seen, [1]);
	assert.equal(ctx.status, 200);
	assert.equal(ctx.body, "ok");
});

test("honoAdapter passes c.req.raw through and wires executionCtx", async () => {
	const { bot, seen } = sink();
	const handler = honoAdapter(bot, { timeoutMs: 5 });

	const raw = new Request("https://x/", { method: "POST", body });
	const res = await handler({ req: { raw }, executionCtx: { waitUntil() {} } });
	assert.equal(res.status, 200);
	assert.deepEqual(seen, [1]);
});

test("elysiaAdapter and nextAdapter take a fetch Request", async () => {
	const a = sink();
	const b = sink();
	assert.equal(
		(await elysiaAdapter(a.bot)({ request: new Request("https://x/", { method: "POST", body }) }))
			.status,
		200,
	);
	assert.equal(
		(await nextAdapter(b.bot)(new Request("https://x/", { method: "POST", body }))).status,
		200,
	);
	assert.deepEqual([a.seen, b.seen], [[1], [1]]);
});

test("cloudflareAdapter threads env + ctx.waitUntil", async () => {
	const { bot, seen } = sink();
	const handler = cloudflareAdapter(bot);

	let waited = false;
	const res = await handler(
		new Request("https://x/", { method: "POST", body }),
		{ KV: 1 },
		{
			waitUntil: () => {
				waited = true;
			},
		},
	);
	assert.equal(res.status, 200);
	assert.deepEqual(seen, [1]);
	assert.equal(waited, false); // nothing timed out, so waitUntil wasn't needed
});

test("svelteKitAdapter reads event.request and platform.context", async () => {
	const { bot, seen } = sink();
	const res = await svelteKitAdapter(bot)({
		request: new Request("https://x/", { method: "POST", body }),
		platform: { context: { waitUntil() {} } },
	});
	assert.equal(res.status, 200);
	assert.deepEqual(seen, [1]);
});

test("awsLambdaAdapter returns an api-gateway result and decodes base64 bodies", async () => {
	const { bot, seen } = sink();
	const handler = awsLambdaAdapter(bot);

	const plain = await handler({ httpMethod: "POST", headers: {}, body });
	assert.equal(plain.statusCode, 200);
	assert.equal(plain.body, "ok");

	const encoded = await handler({
		httpMethod: "POST",
		headers: {},
		body: btoa(body),
		isBase64Encoded: true,
	});
	assert.equal(encoded.statusCode, 200);
	assert.deepEqual(seen, [1, 1]);
});

test("azureAdapter sets context.res", async () => {
	const { bot, seen } = sink();
	const context: { res?: { status?: number; body?: string } } = {};
	await azureAdapter(bot)(context, { method: "POST", headers: {}, body: update });

	assert.equal(context.res?.status, 200);
	assert.equal(context.res?.body, "ok");
	assert.deepEqual(seen, [1]);
});

test("adapters forward the secret token and honour a wrong one", async () => {
	const { bot } = sink();
	const handler = expressAdapter(bot, { secretToken: "s3cret" });

	let status = 0;
	await handler(
		{
			method: "POST",
			url: "/",
			headers: { "x-telegram-bot-api-secret-token": "nope" },
			body: update,
		} as never,
		{
			set statusCode(v: number) {
				status = v;
			},
			setHeader() {},
			end() {},
		} as never,
	);
	assert.equal(status, 401);
});
