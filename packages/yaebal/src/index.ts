/**
 * yaebal — the batteries-included entry point (the gramio idea). re-exports the
 * core engine, the auto-generated contexts, and the common plugins so a bot needs
 * a single import. `createBot()` wires the rich per-update contexts (with their
 * auto-generated shortcut methods) onto every update via the core context factory.
 */

export type { CallbackData, Codec, InferInput, InferOutput, Schema } from "@yaebal/callback-data";
export { callbackData, field } from "@yaebal/callback-data";
export * from "@yaebal/contexts";
export * from "@yaebal/core";
export { and, defineFilter, filters, not, or } from "@yaebal/filters";
export { html, htmlToEntities, md, mdToEntities } from "@yaebal/fmt";
export type { Dict, I18n, I18nControls, LocaleLike, TFn } from "@yaebal/i18n";
export { createI18n, i18n } from "@yaebal/i18n";
export { InlineKeyboard, Keyboard } from "@yaebal/keyboard";
export { session } from "@yaebal/session";
export { deleteWebhook, serve, setWebhook, webhook } from "@yaebal/web";

import { type ContextByType, contextFor } from "@yaebal/contexts";
import {
	type BotOptions,
	type CallbackDataMatcher,
	type CallbackQuery,
	type Composer,
	Context,
	Bot as CoreBot,
	type FileReader,
	type Filtered,
	type FilterQuery,
	type Middleware,
	type UpdateName,
} from "@yaebal/core";

type ContextFactory = NonNullable<BotOptions["contextFactory"]>;

/**
 * auto-detect the runtime and read a local file into bytes — so `media.path()` just
 * works on node, bun and deno from a single `yaebal` import, no platform package to pick.
 * the `node:fs` import is dynamic AND guarded by the node check, so on edge/web it's
 * never reached (or bundled): there the last branch throws and you send
 * `media.buffer()` / `media.url()` instead. this is the whole "platform layer" — yaebal
 * needs no mtcute-style `setPlatform()` global because Telegram Bot API is just fetch + this.
 */
const autoReadFile: FileReader = async (path) => {
	const g = globalThis as {
		Deno?: { readFile(p: string): Promise<Uint8Array> };
		Bun?: { file(p: string): { bytes(): Promise<Uint8Array> } };
		process?: { versions?: { node?: string } };
	};

	if (g.Deno) return g.Deno.readFile(path);
	if (g.Bun) return g.Bun.file(path).bytes();
	if (g.process?.versions?.node) return (await import("node:fs/promises")).readFile(path);

	throw new Error(
		"yaebal: no filesystem in this runtime — send media.buffer()/url() instead of media.path().",
	);
};

/**
 * build a base {@link Context} and graft the auto-generated shortcut methods
 * (`react`, `editText`, `pin`, …) of the matching per-update context onto it.
 * core's own methods (`send`/`reply`/…) win; the rest are added.
 */
export const richContext: ContextFactory = (api, update, updateType, me) => {
	const ctx = new Context({ api, update, updateType, me });
	const rich = contextFor(updateType as keyof ContextByType, api, update);
	const target = ctx as unknown as Record<string, unknown>;

	// payload fields — define as own props so they SHADOW Context's getters
	// (plain assignment throws on getter-only props like `chat`)
	for (const [key, value] of Object.entries(rich)) {
		Object.defineProperty(ctx, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	}

	// shortcut methods (`react`, `editText`, …) and accessors (`senderId`, `isPM`, …)
	// live UP the generated prototype chain — the immediate prototype is just
	// `{ constructor }`, the sugar sits on its bases. walk the whole chain and graft
	// every member core lacks; core's own methods/getters (`send`, `chat`, …) win, and
	// a more-derived override wins over a base one (we never overwrite an own prop).
	for (
		let proto = Object.getPrototypeOf(rich);
		proto && proto !== Object.prototype;
		proto = Object.getPrototypeOf(proto)
	) {
		for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
			if (name === "constructor" || name in target) continue;

			if (typeof desc.value === "function") {
				target[name] = (desc.value as (...args: unknown[]) => unknown).bind(ctx);
			} else if (desc.get) {
				Object.defineProperty(ctx, name, {
					get: desc.get.bind(ctx),
					enumerable: true,
					configurable: true,
				});
			}
		}
	}

	return ctx;
};

// map a filter query to the matching generated context (the part before `:`).
type QueryHead<Q extends string> = Q extends `${infer H}:${string}` ? H : Q;
type RichFor<Q extends string> =
	QueryHead<Q> extends keyof ContextByType ? ContextByType[QueryHead<Q>] : Record<never, never>;

/**
 * a {@link CoreBot} whose routers type the handler context to the matching
 * per-update generated context — so `ctx.react`, `ctx.editText`, … are typed
 * (not just present at runtime). `on("message:text")` → `MessageContext`,
 * `on("callback_query:data")` → `CallbackQueryContext`, etc.
 */
export class Bot<C extends Context = Context> extends CoreBot<C> {
	constructor(token: string, options: BotOptions = {}) {
		// rich per-update contexts + auto-detecting file reader as the defaults — the
		// typed routers below promise the generated shortcut methods, so the factory
		// that grafts them on must be wired even without createBot(). explicit options win.
		super(token, { readFile: autoReadFile, contextFactory: richContext, ...options });
	}

	override derive<D extends object>(fn: (ctx: C) => D | Promise<D>): Bot<C & D>;
	override derive<D extends object>(
		updates: UpdateName | UpdateName[],
		fn: (ctx: C) => D | Promise<D>,
	): Bot<C & Partial<D>>;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation mirrors core Bot
	override derive(a: any, b?: any): any {
		// biome-ignore lint/suspicious/noExplicitAny: forwarding to overloaded base
		(super.derive as any)(a, b);
		return this;
	}

	override decorate<D extends object>(value: D): Bot<C & D> {
		super.decorate(value);
		return this as unknown as Bot<C & D>;
	}

	override guard<C2 extends C>(predicate: (ctx: C) => ctx is C2): Bot<C2>;
	override guard(predicate: (ctx: C) => boolean | Promise<boolean>): this;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation mirrors core Bot
	override guard(predicate: (ctx: C) => boolean | Promise<boolean>): any {
		super.guard(predicate);
		return this;
	}

	override extend<C2 extends Context>(other: Composer<C2>): Bot<C & C2> {
		super.extend(other);
		return this as unknown as Bot<C & C2>;
	}

	override install<Add extends object>(
		plugin: (composer: Composer<C>) => Composer<C & Add>,
	): Bot<C & Add>;
	override install<Add extends object>(plugin: (bot: CoreBot<C>) => CoreBot<C & Add>): Bot<C & Add>;
	override install<Add extends object>(
		plugin:
			| ((composer: Composer<C>) => Composer<C & Add>)
			| ((bot: CoreBot<C>) => CoreBot<C & Add>),
	): Bot<C & Add> {
		const out = (plugin as (bot: CoreBot<C>) => CoreBot<C & Add>)(this);

		if ((out as unknown) !== this) {
			throw new Error(
				"install(): the plugin must chain on (and return) the composer it was given — returning a different composer would silently detach its middleware",
			);
		}

		return this as unknown as Bot<C & Add>;
	}

	override on<Q extends FilterQuery>(
		query: Q,
		...handlers: Middleware<Filtered<C, Q> & RichFor<Q>>[]
	): this {
		return super.on(query, ...(handlers as unknown as Middleware<Filtered<C, Q>>[]));
	}

	override callbackQuery<T>(
		data: CallbackDataMatcher<T>,
		...handlers: Middleware<
			C & { queryData: T; callbackQuery: CallbackQuery } & ContextByType["callback_query"]
		>[]
	): this;
	override callbackQuery(
		trigger: string | RegExp,
		...handlers: Middleware<
			C & {
				match: string | RegExpMatchArray;
				callbackQuery: CallbackQuery;
			} & ContextByType["callback_query"]
		>[]
	): this;
	override callbackQuery(
		trigger: string | RegExp | CallbackDataMatcher<unknown>,
		// biome-ignore lint/suspicious/noExplicitAny: overload implementation mirrors core Bot
		...handlers: Middleware<any>[]
	): this {
		return super.callbackQuery(
			// biome-ignore lint/suspicious/noExplicitAny: forwarding to the overloaded base
			trigger as any,
			...(handlers as unknown as Middleware<
				C & { match: string | RegExpMatchArray; callbackQuery: CallbackQuery }
			>[]),
		);
	}

	override command(
		name: string,
		...handlers: Middleware<
			C & { command: string; args: string[]; payload: string } & ContextByType["message"]
		>[]
	): this {
		return super.command(
			name,
			...(handlers as unknown as Middleware<
				C & { command: string; args: string[]; payload: string }
			>[]),
		);
	}

	override hears(
		trigger: string | RegExp,
		...handlers: Middleware<C & { match: string | RegExpMatchArray } & ContextByType["message"]>[]
	): this {
		return super.hears(
			trigger,
			...(handlers as unknown as Middleware<C & { match: string | RegExpMatchArray }>[]),
		);
	}
}

/** create a bot whose handlers receive the rich auto-generated context — typed and at runtime. */
export function createBot(token: string, options: BotOptions = {}): Bot {
	return new Bot(token, options);
}
