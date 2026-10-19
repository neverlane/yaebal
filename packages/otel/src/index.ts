import {
	type Attributes,
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import { type Api, type Bot, type BotPlugin, type Context, isMediaSource } from "@yaebal/core";

/**
 * @yaebal/otel — opentelemetry tracing for yaebal. every update becomes a `CONSUMER` span and
 * every bot api call made while handling it a `CLIENT` child span — retries show up as one span
 * per attempt — so a slow handler, a flood wait or a failing method is one trace away. depends on
 * `@opentelemetry/api` only: bring your own sdk/exporter (jaeger, tempo, honeycomb, axiom, …).
 *
 * parent/child linking needs an async context manager, which every node/bun sdk registers
 * (`NodeSDK`, `NodeTracerProvider.register()`); without one each api span becomes a root.
 */

export interface OtelOptions {
	/** tracer to record with. default: `trace.getTracer("@yaebal/otel")` from the global provider. */
	tracer?: Tracer;
	/**
	 * attach each api call's params (json, media replaced by a placeholder, cut at 4096 chars) as
	 * the `telegram.params` attribute. off by default — params carry user text.
	 */
	recordApiParams?: boolean;
	/** extra attributes for an update span — e.g. a tenant id from your own context. */
	attributes?: (ctx: Context) => Attributes;
}

/** what lands on `ctx.otel`. */
export interface OtelControl {
	otel: {
		/** the span of the update being handled. */
		readonly span: Span;
		/** run `fn` in a child span named `name` — ended (and marked failed on a throw) for you. */
		record<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
		/** set attributes on the update span. */
		setAttributes(attributes: Attributes): void;
	};
}

const DEFAULT_TRACER = "@yaebal/otel";
const MAX_PARAMS_LENGTH = 4096;

function failSpan(span: Span, error: unknown): void {
	span.recordException(error instanceof Error ? error : String(error));
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: error instanceof Error ? error.message : String(error),
	});
}

/** span-safe json of api params: uploads and raw bytes are named, never inlined. */
function paramsAttribute(params: Record<string, unknown> | undefined): string {
	const json = JSON.stringify(params ?? {}, (_key, value: unknown) => {
		if (isMediaSource(value)) return `[media:${value.kind}]`;
		if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`;
		return value;
	});
	return json.length > MAX_PARAMS_LENGTH ? `${json.slice(0, MAX_PARAMS_LENGTH)}…` : json;
}

/**
 * trace every call on `api` as a `CLIENT` span named `telegram.api/<method>`, parented to
 * whatever span is active when the call starts. use it directly when there's no `Bot` (a bare
 * `createApi` client); the {@link otel} plugin calls it for `bot.api`. instrumenting the same
 * client twice is a no-op.
 */
export function instrumentApi(api: Api, options: OtelOptions = {}): Api {
	if (instrumented.has(api)) return api;
	instrumented.add(api);

	const tracer = options.tracer ?? trace.getTracer(DEFAULT_TRACER);
	// the params object each attempt sends is unique (the before hook returns a fresh copy), so
	// it keys the attempt's span through after/onError without any shared mutable state.
	const spans = new WeakMap<object, Span>();

	api.before((method, params) => {
		const attempt: Record<string, unknown> = { ...params };
		const span = tracer.startSpan(
			`telegram.api/${method}`,
			{
				kind: SpanKind.CLIENT,
				attributes: {
					"telegram.method": method,
					...(typeof params?.chat_id === "number" || typeof params?.chat_id === "string"
						? { "telegram.chat.id": params.chat_id }
						: {}),
					...(options.recordApiParams ? { "telegram.params": paramsAttribute(params) } : {}),
				},
			},
			context.active(),
		);
		spans.set(attempt, span);
		return attempt;
	});

	api.after((_method, params) => {
		const span = params && spans.get(params);
		if (!span) return;
		span.setStatus({ code: SpanStatusCode.OK });
		span.end();
	});

	api.onError((_method, error, attempt, params) => {
		const span = params && spans.get(params);
		if (!span) return undefined;
		span.setAttribute("telegram.attempt", attempt);
		const code = (error as { code?: unknown }).code;
		if (typeof code === "number") span.setAttribute("telegram.error_code", code);
		failSpan(span, error);
		span.end();
		return undefined;
	});

	return api;
}

const instrumented = new WeakSet<Api>();

/**
 * the plugin: install it first, so the update span wraps everything else.
 *
 * ```ts
 * const bot = new Bot(token).install(otel());
 * bot.command("report", async (ctx) => {
 *   const rows = await ctx.otel.record("db.query", () => db.report());
 *   ctx.otel.setAttributes({ "report.rows": rows.length });
 *   await ctx.send(render(rows));
 * });
 * ```
 */
export function otel(options: OtelOptions = {}): BotPlugin<Context, OtelControl> {
	const tracer = options.tracer ?? trace.getTracer(DEFAULT_TRACER);

	return <C extends Context>(bot: Bot<C>) => {
		instrumentApi(bot.api, { ...options, tracer });

		bot.use(async (ctx, next) => {
			const span = tracer.startSpan(
				`telegram.update/${ctx.updateType}`,
				{
					kind: SpanKind.CONSUMER,
					attributes: {
						"telegram.update_id": ctx.update.update_id,
						"telegram.update_type": ctx.updateType,
						...(ctx.chat === undefined ? {} : { "telegram.chat.id": ctx.chat.id }),
						...(ctx.chat === undefined ? {} : { "telegram.chat.type": ctx.chat.type }),
						...(ctx.from === undefined ? {} : { "telegram.user.id": ctx.from.id }),
						...options.attributes?.(ctx),
					},
				},
				context.active(),
			);
			const active = trace.setSpan(context.active(), span);

			const control: OtelControl["otel"] = {
				span,
				record: (name, fn) =>
					context.with(active, () =>
						tracer.startActiveSpan(name, async (child) => {
							try {
								return await fn(child);
							} catch (error) {
								failSpan(child, error);
								throw error;
							} finally {
								child.end();
							}
						}),
					),
				setAttributes: (attributes) => {
					span.setAttributes(attributes);
				},
			};
			Object.assign(ctx as object, { otel: control });

			try {
				await context.with(active, next);
			} catch (error) {
				failSpan(span, error);
				throw error;
			} finally {
				span.end();
			}
		});

		return bot as unknown as Bot<C & OtelControl>;
	};
}
