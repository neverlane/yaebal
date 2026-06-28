import type { Context } from "./context.js";
import type { CallbackQuery, MessageEntity, UpdateName } from "./telegram-types.js";

export type NextFn = () => Promise<void>;
export type Middleware<C> = (ctx: C, next: NextFn) => unknown | Promise<unknown>;

/**
 * a plugin enriches the context. dependencies are expressed by the type it
 * requires (`In`), so installing a plugin before its dependency is a compile
 * error — not a runtime surprise (core invariant #4).
 *
 * @example
 * const session: Plugin<Context, { session: Session }>;
 * const auth:    Plugin<Context & { session: Session }, { user: User }>;
 * bot.install(auth);                  // ❌ no `session` on the context
 * bot.install(session).install(auth); // ✅
 */
export type Plugin<In extends Context = Context, Out extends object = Record<never, never>> = <
	C extends In,
>(
	composer: Composer<C>,
) => Composer<C & Out>;

/**
 * a composable filter (the mtcute idea). `test` is a type guard, so a matching
 * filter narrows the context to `C & Add`; filters may also attach `Add` fields
 * onto the context as a side effect (e.g. `regex` exposes `ctx.match`). combine
 * with `and` / `or` / `not` from `@yaebal/filters`.
 */
export interface Filter<C = Context, Add extends object = Record<never, never>> {
	test(ctx: C): ctx is C & Add;
}

/**
 * filter query mini-language (the grammY idea), e.g.
 * `"message:text"`, `"callback_query:data"`, `":photo"`.
 */
export type FilterQuery = UpdateName | `${UpdateName}:${string}` | `:${string}`;

/** narrows the context type for known queries so handlers get non-optional fields. */
export type Filtered<C, Q extends string> = Q extends `${string}:text` | `${string}:caption`
	? C & { text: string }
	: Q extends `${string}:data` | "callback_query"
		? C & { callbackQuery: CallbackQuery }
		: Q extends `${string}:entities${string}`
			? C & { entities: MessageEntity[] }
			: C;

/** koa-style middleware composer with single-`next()` protection. */
export function compose<C>(middlewares: Middleware<C>[]): (ctx: C, next?: NextFn) => Promise<void> {
	return function composed(ctx, next) {
		let lastIndex = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= lastIndex) throw new Error("next() called multiple times");
			lastIndex = i;

			const fn = i === middlewares.length ? next : middlewares[i];
			if (!fn) return;

			await fn(ctx, () => dispatch(i + 1));
		};

		return dispatch(0);
	};
}

function checkField(ctx: Context, field: string): boolean {
	switch (field) {
		case "text":
		case "caption":
			return typeof ctx.text === "string" && ctx.text.length > 0;
		case "data":
			return Boolean(ctx.callbackQuery?.data);
		case "entities":
			return Boolean(ctx.message?.entities?.length);
		default: {
			const msg = ctx.message as Record<string, unknown> | undefined;
			return Boolean(msg?.[field]);
		}
	}
}

export function matchQuery(ctx: Context, query: string): boolean {
	const [head, ...rest] = query.split(":");
	if (head && head.length > 0 && ctx.updateType !== head) return false;

	for (const field of rest) {
		if (!checkField(ctx, field)) return false;
	}

	return true;
}

/**
 * the chainable middleware pipeline. every context-enriching method returns a
 * composer whose context type carries the new properties — types flow through
 * the whole chain (the GramIO idea). `Composer` is also usable standalone, so
 * feature files can be plain composers with no `Bot` and no token.
 */
export class Composer<C extends Context = Context> {
	protected middlewares: Middleware<C>[] = [];

	/** raw middleware. call `next()` to continue the chain. */
	use(...middleware: Middleware<C>[]): this {
		this.middlewares.push(...middleware);
		return this;
	}

	/** handle a specific update, optionally narrowed by a filter query. */
	on<Q extends FilterQuery>(query: Q, ...handlers: Middleware<Filtered<C, Q>>[]): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) =>
			matchQuery(ctx, query as string) ? handler(ctx, next) : next(),
		);

		return this;
	}

	/** handle `/<name>` commands. Strips a trailing `@botname` and parses args. */
	command(name: string, ...handlers: Middleware<C & { command: string; args: string[] }>[]): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) => {
			const text = ctx.text;
			if (text === undefined || !text.startsWith("/")) return next();

			const [head, ...args] = text.slice(1).split(/\s+/);
			const base = head?.split("@")[0];
			if (base !== name) return next();

			Object.assign(ctx as object, { command: base, args });
			return handler(ctx, next);
		});

		return this;
	}

	/** match message text/caption against a string or regex; exposes `ctx.match`. */
	hears(
		trigger: string | RegExp,
		...handlers: Middleware<C & { match: string | RegExpMatchArray }>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) => {
			const text = ctx.text;
			if (text === undefined) return next();

			if (typeof trigger === "string") {
				if (text !== trigger) return next();

				Object.assign(ctx as object, { match: text });
			} else {
				const m = text.match(trigger);
				if (!m) return next();

				Object.assign(ctx as object, { match: m });
			}

			return handler(ctx, next);
		});

		return this;
	}

	/** match callback-query data against a string or regex; exposes `ctx.match`. */
	callbackQuery(
		trigger: string | RegExp,
		...handlers: Middleware<
			C & { match: string | RegExpMatchArray; callbackQuery: CallbackQuery }
		>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) => {
			const data = ctx.callbackQuery?.data;

			if (data === undefined) return next();

			if (typeof trigger === "string") {
				if (data !== trigger) return next();

				Object.assign(ctx as object, { match: data });
			} else {
				const m = data.match(trigger);
				if (!m) return next();

				Object.assign(ctx as object, { match: m });
			}

			return handler(ctx, next);
		});

		return this;
	}

	/** continue only if the predicate holds. */
	guard(predicate: (ctx: C) => boolean | Promise<boolean>): this {
		this.middlewares.push(async (ctx, next) => {
			if (await predicate(ctx)) await next();
		});

		return this;
	}

	/**
	 * run `handlers` only when `filter` matches. the filter narrows the context
	 * (and may attach data), so handlers see `C & Add`. compose filters with
	 * `and` / `or` / `not` from `@yaebal/filters`.
	 */
	filter<Add extends object>(
		filter: Filter<Context, Add>,
		...handlers: Middleware<C & Add>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) => (filter.test(ctx) ? handler(ctx, next) : next()));
		return this;
	}

	/** apply a plugin. its required context (`In`) is checked at compile time. */
	install<Add extends object>(
		plugin: (composer: Composer<C>) => Composer<C & Add>,
	): Composer<C & Add> {
		return plugin(this);
	}

	/** async, per-request context enrichment. adds `D` to the context type. */
	derive<D extends object>(fn: (ctx: C) => D | Promise<D>): Composer<C & D>;
	/**
	 * scoped enrichment (the GramIO idea): `fn` runs only for the listed update
	 * types, so irrelevant updates pay nothing. the fields are typed as optional
	 * (`Partial<D>`) since they are absent on other update types.
	 */
	derive<D extends object>(
		updates: UpdateName | UpdateName[],
		fn: (ctx: C) => D | Promise<D>,
	): Composer<C & Partial<D>>;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation
	derive(a: any, b?: any): any {
		const scoped = typeof a !== "function";
		const only: UpdateName[] | null = scoped ? (Array.isArray(a) ? a : [a]) : null;
		const fn = (scoped ? b : a) as (ctx: C) => object | Promise<object>;

		this.middlewares.push(async (ctx, next) => {
			if (!only || only.includes(ctx.updateType)) Object.assign(ctx as object, await fn(ctx));
			await next();
		});

		return this;
	}

	/**
	 * static context enrichment. adds `D` to the context type.
	 * NOTE: a production build would hoist this out of the per-request path entirely;
	 * here it is applied once at the top of the chain for simplicity.
	 */
	decorate<D extends object>(value: D): Composer<C & D> {
		this.middlewares.push((ctx, next) => {
			Object.assign(ctx as object, value);
			return next();
		});
		
		return this as unknown as Composer<C & D>;
	}

	/** merge another composer in, inheriting its full context type. */
	extend<C2 extends Context>(other: Composer<C2>): Composer<C & C2> {
		this.middlewares.push(other.toMiddleware() as unknown as Middleware<C>);
		return this as unknown as Composer<C & C2>;
	}

	/** collapse this composer into a single middleware (used by `extend` and `Bot`). */
	toMiddleware(): Middleware<C> {
		const composed = compose(this.middlewares);
		return (ctx, next) => composed(ctx, next);
	}
}
