import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import {
	type Attributes,
	type AttributeValue,
	type ContextManager,
	context,
	type Context as OtelContext,
	ROOT_CONTEXT,
	type Span,
	type SpanContext,
	type SpanKind,
	type SpanOptions,
	type SpanStatus,
	SpanStatusCode,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import { Bot, media } from "@yaebal/core";
import { otel } from "./index.js";

// what every node sdk registers: async context that follows awaits.
class AsyncContextManager implements ContextManager {
	readonly #storage = new AsyncLocalStorage<OtelContext>();
	active(): OtelContext {
		return this.#storage.getStore() ?? ROOT_CONTEXT;
	}
	with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
		ctx: OtelContext,
		fn: F,
		thisArg?: ThisParameterType<F>,
		...args: A
	): ReturnType<F> {
		return this.#storage.run(ctx, () => fn.apply(thisArg, args));
	}
	bind<T>(_ctx: OtelContext, target: T): T {
		return target;
	}
	enable(): this {
		return this;
	}
	disable(): this {
		return this;
	}
}
context.setGlobalContextManager(new AsyncContextManager());

let nextId = 1;

class RecordedSpan implements Span {
	readonly attributes: Attributes = {};
	status: SpanStatus = { code: SpanStatusCode.UNSET };
	ended = false;
	exceptions: unknown[] = [];
	readonly #context: SpanContext;

	constructor(
		readonly name: string,
		readonly kind: SpanKind | undefined,
		readonly parent: RecordedSpan | undefined,
		attributes: Attributes | undefined,
	) {
		Object.assign(this.attributes, attributes);
		this.#context = {
			traceId: "t".repeat(32),
			spanId: String(nextId++).padStart(16, "0"),
			traceFlags: 1,
		};
	}
	spanContext(): SpanContext {
		return this.#context;
	}
	setAttribute(key: string, value: AttributeValue): this {
		this.attributes[key] = value;
		return this;
	}
	setAttributes(attributes: Attributes): this {
		Object.assign(this.attributes, attributes);
		return this;
	}
	addEvent(): this {
		return this;
	}
	addLink(): this {
		return this;
	}
	addLinks(): this {
		return this;
	}
	setStatus(status: SpanStatus): this {
		this.status = status;
		return this;
	}
	updateName(): this {
		return this;
	}
	end(): void {
		this.ended = true;
	}
	isRecording(): boolean {
		return !this.ended;
	}
	recordException(exception: unknown): void {
		this.exceptions.push(exception);
	}
}

function recordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
	const spans: RecordedSpan[] = [];
	const start = (name: string, options: SpanOptions = {}, ctx?: OtelContext): RecordedSpan => {
		const parent = trace.getSpan(ctx ?? context.active()) as RecordedSpan | undefined;
		const span = new RecordedSpan(name, options.kind, parent, options.attributes);
		spans.push(span);
		return span;
	};
	const tracer = {
		startSpan: start,
		startActiveSpan(name: string, ...rest: unknown[]) {
			const fn = rest.at(-1) as (span: Span) => unknown;
			const span = start(name);
			return context.with(trace.setSpan(context.active(), span), () => fn(span));
		},
	} as unknown as Tracer;
	return { tracer, spans };
}

const update = (text: string) => ({
	update_id: 7,
	message: {
		message_id: 1,
		date: 0,
		chat: { id: 42, type: "private" as const },
		from: { id: 5, is_bot: false, first_name: "u" },
		text,
	},
});

test("an update span parents the api spans and custom spans made while handling it", {
	timeout: 5_000,
}, async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ ok: true, result: { message_id: 2 } })),
	);
	const { tracer, spans } = recordingTracer();

	const bot = new Bot("123:test").install(otel({ tracer, recordApiParams: true }));
	bot.on("message", async (ctx) => {
		await ctx.otel.record("db.query", async () => {});
		ctx.otel.setAttributes({ "report.rows": 3 });
		await ctx.sendDocument(media.buffer(new Uint8Array(8), "a.bin"));
	});
	await bot.handleUpdate(update("hi") as never);

	const [root, custom, api] = spans;
	assert.equal(root?.name, "telegram.update/message");
	assert.equal(root?.attributes["telegram.chat.id"], 42);
	assert.equal(root?.attributes["telegram.user.id"], 5);
	assert.equal(root?.attributes["report.rows"], 3);
	assert.equal(custom?.name, "db.query");
	assert.equal(custom?.parent, root);
	assert.equal(api?.name, "telegram.api/sendDocument");
	assert.equal(api?.parent, root);
	assert.match(String(api?.attributes["telegram.params"]), /\[media:buffer\]/);
	assert.ok(
		spans.every((span) => span.ended),
		"every span is ended",
	);
	assert.equal(api?.status.code, SpanStatusCode.OK);
});

test("failed api calls and throwing handlers mark their spans as errors", {
	timeout: 5_000,
}, async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				JSON.stringify({ ok: false, error_code: 403, description: "Forbidden: bot was blocked" }),
			),
	);
	const { tracer, spans } = recordingTracer();

	const bot = new Bot("123:test").install(otel({ tracer }));
	bot.onError(() => {});
	bot.on("message", (ctx) => ctx.send("hi"));
	await bot.handleUpdate(update("hi") as never);

	const [root, api] = spans;
	assert.equal(api?.status.code, SpanStatusCode.ERROR);
	assert.equal(api?.attributes["telegram.error_code"], 403);
	assert.equal(root?.status.code, SpanStatusCode.ERROR);
	assert.ok(root?.ended && api?.ended);
});
