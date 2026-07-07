import { type Context, messageOf } from "./context.js";
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
 * a composable filter (the mtcute idea, made two-phase). a filter is a predicate
 * over the context — sync or async — that may *stage* extra fields in `bag`
 * (e.g. `regex` stages `ctx.match`). nothing touches the context until the whole
 * filter tree matches: `composer.filter()` commits the bag onto the context only
 * on success, so a failing branch can never leak or corrupt data. `Add` describes
 * what the handler gains — staged bag fields and/or purely type-level narrowing
 * (e.g. `chatType("private")` narrows `ctx.chat` without staging anything).
 * combine with `and` / `or` / `not` from `@yaebal/filters`; any bare
 * `(ctx) => boolean` predicate is already a valid `Filter`.
 */
export type Filter<C = Context, Add extends object = Record<never, never>> = {
	(ctx: C, bag: Record<string, unknown>): boolean | Promise<boolean>;
	/** type-level carrier for `Add` — never present at runtime. */
	readonly "~adds"?: Add;
};

/**
 * the structural shape of a `@yaebal/callback-data` namespace that `callbackQuery`
 * can route on — matched by value and decoded to `T`, exposed to handlers as
 * `ctx.queryData`. kept structural so core takes no dependency on the plugin.
 */
export interface CallbackDataMatcher<T> {
	readonly pattern: RegExp;
	unpack(raw: string): T | undefined;
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

// field checks read the raw update (via messageOf), never ctx getters — enrichment
// (e.g. the rich contexts grafting the button's message onto a callback ctx) must not
// change what a filter query matches.
function checkField(ctx: Context, field: string): boolean {
	const msg = messageOf(ctx.update);

	switch (field) {
		case "text":
			return typeof msg?.text === "string" && msg.text.length > 0;
		case "caption":
			return typeof msg?.caption === "string" && msg.caption.length > 0;
		case "data":
			return Boolean(ctx.update.callback_query?.data);
		case "entities":
			return Boolean(msg?.entities?.length);
		default:
			return Boolean((msg as Record<string, unknown> | undefined)?.[field]);
	}
}

/** update types whose text can carry a fresh (non-edited) command. */
export const COMMAND_UPDATES: ReadonlySet<string> = new Set([
	"message",
	"channel_post",
	"business_message",
]);

/**
 * `String.match` with a `g`/`y` regex is stateful across calls (`lastIndex`
 * persists on the shared RegExp), so a trigger could silently skip every other
 * update. reset before matching — each update matches from the start.
 */
export function matchOf(text: string, re: RegExp): RegExpMatchArray | null {
	if (re.global || re.sticky) re.lastIndex = 0;
	return text.match(re);
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
	protected decorations: object[] = [];

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

	/**
	 * handle `/<name>` commands. matches the text of fresh messages only (an edited
	 * `/cmd` doesn't re-fire), case-insensitively (`/Start` hits `command("start")`),
	 * strips a trailing `@botname` — and when the bot's username is known (`ctx.me`,
	 * filled by long polling) a mismatching mention (`/cmd@other_bot`) is skipped.
	 * exposes `ctx.command`, whitespace-split `ctx.args`, and the raw trimmed
	 * remainder as `ctx.payload` (deep-link parameters arrive intact).
	 */
	command(
		name: string,
		...handlers: Middleware<C & { command: string; args: string[]; payload: string }>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);
		const wanted = name.toLowerCase();

		this.middlewares.push((ctx, next) => {
			if (!COMMAND_UPDATES.has(ctx.updateType)) return next();

			const text = messageOf(ctx.update)?.text;
			if (text === undefined || !text.startsWith("/")) return next();

			const [head = ""] = text.slice(1).split(/\s/, 1);
			const [base = "", mention] = head.split("@");
			if (base.toLowerCase() !== wanted) return next();

			const username = ctx.me?.username;
			if (mention && username && mention.toLowerCase() !== username.toLowerCase()) return next();

			const payload = text.slice(1 + head.length).trim();
			const args = payload === "" ? [] : payload.split(/\s+/);

			Object.assign(ctx as object, { command: base, args, payload });
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
			// the update's own message only — a callback query (whose rich context carries
			// the button's message) must not trigger text handlers
			const msg = messageOf(ctx.update);
			const text = msg?.text ?? msg?.caption;
			if (text === undefined) return next();

			if (typeof trigger === "string") {
				if (text !== trigger) return next();

				Object.assign(ctx as object, { match: text });
			} else {
				const m = matchOf(text, trigger);
				if (!m) return next();

				Object.assign(ctx as object, { match: m });
			}

			return handler(ctx, next);
		});

		return this;
	}

	/**
	 * route callback-query data. pass a `@yaebal/callback-data` namespace to validate +
	 * decode the payload and expose it, typed, as `ctx.queryData` — handlers run only on a
	 * clean unpack, so there's no `filter`-then-`unpack` gap.
	 */
	callbackQuery<T>(
		data: CallbackDataMatcher<T>,
		...handlers: Middleware<C & { queryData: T; callbackQuery: CallbackQuery }>[]
	): this;
	/** match callback-query data against a string or regex; exposes `ctx.match`. */
	callbackQuery(
		trigger: string | RegExp,
		...handlers: Middleware<
			C & { match: string | RegExpMatchArray; callbackQuery: CallbackQuery }
		>[]
	): this;
	callbackQuery(
		trigger: string | RegExp | CallbackDataMatcher<unknown>,
		// biome-ignore lint/suspicious/noExplicitAny: overload implementation
		...handlers: Middleware<any>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		// a callback-data namespace — run the handler only when its own unpack succeeds
		if (typeof trigger !== "string" && !(trigger instanceof RegExp)) {
			this.middlewares.push((ctx, next) => {
				const data = ctx.update.callback_query?.data;
				if (data === undefined) return next();

				const queryData = trigger.unpack(data);
				if (queryData === undefined) return next();

				Object.assign(ctx as object, { queryData });
				return handler(ctx, next);
			});

			return this;
		}

		this.middlewares.push((ctx, next) => {
			const data = ctx.update.callback_query?.data;

			if (data === undefined) return next();

			if (typeof trigger === "string") {
				if (data !== trigger) return next();

				Object.assign(ctx as object, { match: data });
			} else {
				const m = matchOf(data, trigger);
				if (!m) return next();

				Object.assign(ctx as object, { match: m });
			}

			return handler(ctx, next);
		});

		return this;
	}

	/**
	 * narrowing form: a type-guard predicate types everything registered after it
	 * as `C2` — the type flows down the chain, like `derive`/`filter`.
	 */
	guard<C2 extends C>(predicate: (ctx: C) => ctx is C2): Composer<C2>;
	/** continue only if the predicate holds. */
	guard(predicate: (ctx: C) => boolean | Promise<boolean>): this;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation
	guard(predicate: (ctx: C) => boolean | Promise<boolean>): any {
		this.middlewares.push(async (ctx, next) => {
			if (await predicate(ctx)) await next();
		});

		return this;
	}

	/**
	 * run `handlers` only when `filter` matches; handlers see `C & Add`. the
	 * filter may be sync or async, and any bare `(ctx) => boolean` predicate
	 * works. fields the filter staged in its bag are committed onto the context
	 * only here, after the whole filter tree matched — a rejected filter leaves
	 * the context untouched. compose filters with `and` / `or` / `not` from
	 * `@yaebal/filters`.
	 */
	filter<Add extends object = Record<never, never>>(
		filter: Filter<C, Add>,
		...handlers: Middleware<C & Add>[]
	): this {
		const handler = compose(handlers as unknown as Middleware<C>[]);

		this.middlewares.push((ctx, next) => {
			const bag: Record<string, unknown> = {};
			const decide = (matched: boolean) => {
				if (!matched) return next();

				Object.assign(ctx as object, bag);
				return handler(ctx, next);
			};

			const verdict = filter(ctx, bag);
			return typeof verdict === "boolean" ? decide(verdict) : verdict.then(decide);
		});

		return this;
	}

	/** apply a plugin. its required context (`In`) is checked at compile time. */
	install<Add extends object>(
		plugin: (composer: Composer<C>) => Composer<C & Add>,
	): Composer<C & Add> {
		const out = plugin(this);

		// plugins chain on the composer they receive (derive/decorate/use all return it);
		// a different object means its middleware landed somewhere detached — fail loud
		// instead of silently dropping it.
		if ((out as unknown) !== this) {
			throw new Error(
				"install(): the plugin must chain on (and return) the composer it was given — returning a different composer would silently detach its middleware",
			);
		}

		return out;
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

	/** static context enrichment. adds `D` to the context type without adding middleware hops. */
	decorate<D extends object>(value: D): Composer<C & D> {
		this.decorations.push(value);
		return this as unknown as Composer<C & D>;
	}

	/** merge another composer in, inheriting its full context type. */
	extend<C2 extends Context>(other: Composer<C2>): Composer<C & C2> {
		this.middlewares.push(other.toMiddleware() as unknown as Middleware<C>);
		return this as unknown as Composer<C & C2>;
	}

	/** collapse this composer into a single middleware (used by `extend` and `Bot`). */
	toMiddleware(): Middleware<C> {
		const decorations = Object.assign({}, ...this.decorations);
		const composed = compose(this.middlewares);

		return (ctx, next) => {
			Object.assign(ctx as object, decorations);
			return composed(ctx, next);
		};
	}
}
