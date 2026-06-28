/**
 * yaebal — the batteries-included entry point (the gramio idea). re-exports the
 * core engine, the auto-generated contexts, and the common plugins so a bot needs
 * a single import. `createBot()` wires the rich per-update contexts (with their
 * auto-generated shortcut methods) onto every update via the core context factory.
 */

export * from "@yaebal/core";
export * from "@yaebal/contexts";
export { and, filters, not, or } from "@yaebal/filters";
export { html, htmlToEntities, md, mdToEntities } from "@yaebal/fmt";
export { InlineKeyboard, Keyboard } from "@yaebal/keyboard";
export { callbackData } from "@yaebal/callback-data";
export { session } from "@yaebal/session";
export { i18n } from "@yaebal/i18n";
export { deleteWebhook, serve, setWebhook, webhook } from "@yaebal/web";

import { type ContextByType, contextFor } from "@yaebal/contexts";
import {
	type BotOptions,
	Context,
	Bot as CoreBot,
	type FileReader,
	type FilterQuery,
	type Filtered,
	type Middleware,
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
export const richContext: ContextFactory = (api, update, updateType) => {
	const ctx = new Context({ api, update, updateType });
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

	// shortcut methods live on the generated prototype — bind the ones core lacks
	const proto = Object.getPrototypeOf(rich) as Record<string, unknown>;
	for (const name of Object.getOwnPropertyNames(proto)) {
		if (name === "constructor") continue;

		const fn = proto[name];

		if (typeof fn === "function" && !(name in ctx)) {
			target[name] = (fn as (...args: unknown[]) => unknown).bind(ctx);
		}
	}

	return ctx;
};

// map a filter query to the matching generated context (the part before `:`).
type QueryHead<Q extends string> = Q extends `${infer H}:${string}` ? H : Q;
type RichFor<Q extends string> = QueryHead<Q> extends keyof ContextByType
	? ContextByType[QueryHead<Q>]
	: Record<never, never>;

/**
 * a {@link CoreBot} whose routers type the handler context to the matching
 * per-update generated context — so `ctx.react`, `ctx.editText`, … are typed
 * (not just present at runtime). `on("message:text")` → `MessageContext`,
 * `on("callback_query:data")` → `CallbackQueryContext`, etc.
 */
export class Bot<C extends Context = Context> extends CoreBot<C> {
	constructor(token: string, options: BotOptions = {}) {
		// auto-detecting file reader as the default; an explicit `readFile` still wins
		super(token, { readFile: autoReadFile, ...options });
	}

	override on<Q extends FilterQuery>(
		query: Q,
		...handlers: Middleware<Filtered<C, Q> & RichFor<Q>>[]
	): this {
		return super.on(query, ...(handlers as unknown as Middleware<Filtered<C, Q>>[]));
	}

	override command(
		name: string,
		...handlers: Middleware<C & { command: string; args: string[] } & ContextByType["message"]>[]
	): this {
		return super.command(
			name,
			...(handlers as unknown as Middleware<C & { command: string; args: string[] }>[]),
		);
	}
}

/** create a bot whose handlers receive the rich auto-generated context — typed and at runtime. */
export function createBot(token: string, options: BotOptions = {}): Bot {
	return new Bot(token, { contextFactory: richContext, ...options });
}
