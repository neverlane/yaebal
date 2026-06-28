import type { Context, Filter } from "@yaebal/core";

/**
 * @yaebal/filters — composable, type-narrowing update filters (the mtcute idea),
 * for the core `composer.filter(...)` method. a filter is a type guard that may
 * also attach data to the context (e.g. `regex` exposes `ctx.match`); combine
 * them with `and` / `or` / `not`.
 *
 *   bot.filter(and(isPrivate, command("buy")), (ctx) => ctx.args);
 *   bot.filter(regex(/^\d+$/), (ctx) => ctx.match[0]);
 *   bot.filter(or(mediaType("photo"), mediaType("video")), handler);
 */

const make = <Add extends object = Record<never, never>>(
	test: (ctx: Context) => boolean,
): Filter<Context, Add> => ({ test: test as (ctx: Context) => ctx is Context & Add });

/** message has non-empty text. */
export const text: Filter<Context, { text: string }> = make(
	(ctx) => typeof ctx.text === "string" && ctx.text.length > 0,
);

/** text matches `re`; exposes `ctx.match` (RegExpMatchArray). */
export function regex(re: RegExp): Filter<Context, { match: RegExpMatchArray }> {
	return make((ctx) => {
		const m = ctx.text?.match(re);
		if (!m) return false;

		Object.assign(ctx as object, { match: m });
		return true;
	});
}

/** a `/command` (optionally a specific name); exposes `ctx.command` and `ctx.args`. */
export function command(name?: string): Filter<Context, { command: string; args: string[] }> {
	return make((ctx) => {
		const value = ctx.text;
		if (!value || !value.startsWith("/")) return false;

		const parts = value.slice(1).split(/\s+/);
		const head = parts[0]?.split("@")[0] ?? "";

		if (name !== undefined && head !== name) return false;
		Object.assign(ctx as object, { command: head, args: parts.slice(1) });

		return true;
	});
}

/** chat is one of the given types (`private`, `group`, `supergroup`, `channel`). */
export function chatType(...types: string[]): Filter<Context> {
	return make((ctx) => types.includes(ctx.chat?.type ?? ""));
}

export const isPrivate: Filter<Context> = chatType("private");
export const isGroup: Filter<Context> = chatType("group", "supergroup");

/** update is from one of the given user ids. */
export function fromUser(...ids: number[]): Filter<Context> {
	return make((ctx) => ctx.from?.id !== undefined && ids.includes(ctx.from.id));
}

/** update is in one of the given chat ids. */
export function chatId(...ids: number[]): Filter<Context> {
	return make((ctx) => ctx.chat?.id !== undefined && ids.includes(ctx.chat.id));
}

const MEDIA_KINDS = [
	"photo",
	"video",
	"document",
	"audio",
	"voice",
	"sticker",
	"animation",
	"video_note",
] as const;

/** message carries one of the given media kinds (`photo`, `video`, …). */
export function mediaType(...kinds: string[]): Filter<Context> {
	return make((ctx) => {
		const msg = ctx.message as Record<string, unknown> | undefined;
		return !!msg && kinds.some((k) => msg[k] != null);
	});
}

/** message carries any media. */
export const media: Filter<Context> = make((ctx) => {
	const msg = ctx.message as Record<string, unknown> | undefined;
	return !!msg && MEDIA_KINDS.some((k) => msg[k] != null);
});

/** message contains an entity of the given type (`url`, `mention`, `hashtag`, …). */
export function hasEntity(type: string): Filter<Context> {
	return make((ctx) => {
		const entities = (ctx.message as { entities?: { type: string }[] } | undefined)?.entities;
		return Array.isArray(entities) && entities.some((e) => e.type === type);
	});
}

/** matches when every filter matches; the additions intersect. */
export function and<A extends object, B extends object>(
	a: Filter<Context, A>,
	b: Filter<Context, B>,
): Filter<Context, A & B>;

export function and<A extends object, B extends object, D extends object>(
	a: Filter<Context, A>,
	b: Filter<Context, B>,
	c: Filter<Context, D>,
): Filter<Context, A & B & D>;

export function and(...filters: Filter<Context, object>[]): Filter<Context>;
export function and(...filters: Filter<Context, object>[]): Filter<Context> {
	return make((ctx) => {
		const before = ownKeys(ctx);
		if (filters.every((f) => f.test(ctx))) return true;

		rollback(ctx, before); // a later filter failed → undo earlier filters' attachments
		return false;
	});
}

/** matches when any filter matches. no additions (the matched branch is unknown). */
export function or(...filters: Filter<Context, object>[]): Filter<Context> {
	return make((ctx) => filters.some((f) => attempt(f, ctx)));
}

/** matches when the filter does NOT match. no additions. */
export function not(filter: Filter<Context, object>): Filter<Context> {
	return make((ctx) => {
		const before = ownKeys(ctx);
		const matched = filter.test(ctx);

		rollback(ctx, before); // the inner filter's attachments are never wanted by `not`
		return !matched;
	});
}

// data-attaching filters (regex/command/custom) call Object.assign before returning.
// when a combinator ends up rejecting, undo any fields the sub-filters attached so they
// don't leak onto the context for downstream middleware.
const ownKeys = (ctx: Context): Set<string> => new Set(Object.keys(ctx));

function rollback(ctx: Context, before: Set<string>): void {
	const bag = ctx as unknown as Record<string, unknown>;

	for (const key of Object.keys(bag)) {
		if (!before.has(key)) {
			delete bag[key];
		}
	}
}

function attempt(filter: Filter<Context, object>, ctx: Context): boolean {
	const before = ownKeys(ctx);

	if (filter.test(ctx)) return true;

	rollback(ctx, before);
	return false;
}

/** everything under one namespace, mtcute-style: `filters.command(...)`, `filters.and(...)`. */
export const filters = {
	text,
	regex,
	command,
	chatType,
	isPrivate,
	isGroup,
	fromUser,
	chatId,
	mediaType,
	media,
	hasEntity,
	and,
	or,
	not,
};
