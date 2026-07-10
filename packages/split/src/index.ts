import type {
	Context,
	FormatResult,
	MediaSource,
	Message,
	MessageEntity,
	Plugin,
} from "@yaebal/core";

/** telegram's per-message text limit, in UTF-16 code units (what `String#length` counts). */
export const MAX_MESSAGE_LENGTH = 4096;
/** telegram's caption limit for media messages (`sendPhoto`, `sendDocument`, …). */
export const MAX_CAPTION_LENGTH = 1024;

/**
 * one telegram-sized piece of a longer text. shaped exactly like a `format` result
 * (`{ text, entities }`), so it can be passed straight to `ctx.send(part)` — entities
 * that cross a boundary are clipped on one side and re-based on the other.
 */
export interface SplitPart {
	text: string;
	entities: MessageEntity[];
}

/** what a text is before splitting: a plain string or a `format`/`fmt` result. */
export type SplitSource = string | FormatResult;

function assertLimit(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new TypeError(`split: ${name} must be a positive integer, got ${value}`);
	}
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;
/** space, tab, `\n`, `\r` — what gets trimmed at part boundaries. */
const isBoundaryWhitespace = (code: number): boolean =>
	code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;

/**
 * clip `entities` to the absolute slice `[start, end)` and re-base offsets to it.
 * entity offsets/lengths are UTF-16 code units, same as `String#length` — no conversion.
 */
function clipEntities(entities: MessageEntity[], start: number, end: number): MessageEntity[] {
	const clipped: MessageEntity[] = [];

	for (const entity of entities) {
		const from = Math.max(entity.offset, start);
		const to = Math.min(entity.offset + entity.length, end);
		if (to <= from) continue;

		clipped.push({ ...entity, offset: from - start, length: to - from });
	}

	return clipped;
}

/**
 * pick where to cut one part out of `text` starting at `from`, at most `max` units long.
 * prefers the last newline in the window, then the last space/tab, then a hard cut that
 * never lands inside a surrogate pair. `end` is the part end (trailing whitespace trimmed),
 * `next` is where the remainder starts (the boundary character itself is consumed).
 */
function cutPoint(text: string, from: number, max: number): { end: number; next: number } {
	const ceiling = from + max;

	let end: number;
	let next: number;

	const newline = text.lastIndexOf("\n", ceiling);
	if (newline > from) {
		end = newline;
		next = newline + 1;
	} else {
		const space = Math.max(text.lastIndexOf(" ", ceiling), text.lastIndexOf("\t", ceiling));
		if (space > from) {
			end = space;
			next = space + 1;
		} else {
			end = ceiling;
			if (
				end - from > 1 &&
				isHighSurrogate(text.charCodeAt(end - 1)) &&
				isLowSurrogate(text.charCodeAt(end))
			) {
				end -= 1;
			}
			next = end;
		}
	}

	while (end > from && isBoundaryWhitespace(text.charCodeAt(end - 1))) end -= 1;

	return { end, next };
}

/**
 * lazily split a text (plain string or `format` result) into telegram-sized parts.
 * prefers newline boundaries, then spaces, and never cuts a surrogate pair in half.
 * whitespace-only parts are dropped — telegram rejects them — so an empty text yields
 * nothing. entities are clipped and re-based per part.
 */
export function* splitParts(
	text: SplitSource,
	max: number = MAX_MESSAGE_LENGTH,
): Generator<SplitPart, void, undefined> {
	assertLimit(max, "max");

	const source = typeof text === "string" ? text : text.text;
	const entities = typeof text === "string" ? [] : text.entities;

	let pos = 0;
	while (source.length - pos > max) {
		// leading newlines are boundary artifacts, not content — telegram trims them anyway
		while (source.charCodeAt(pos) === 0x0a || source.charCodeAt(pos) === 0x0d) pos += 1;
		if (source.length - pos <= max) break;

		const { end, next } = cutPoint(source, pos, max);
		if (end > pos) {
			yield { text: source.slice(pos, end), entities: clipEntities(entities, pos, end) };
		}
		pos = next;
	}

	while (source.charCodeAt(pos) === 0x0a || source.charCodeAt(pos) === 0x0d) pos += 1;
	let tailEnd = source.length;
	while (tailEnd > pos && isBoundaryWhitespace(source.charCodeAt(tailEnd - 1))) tailEnd -= 1;
	if (tailEnd <= pos) return;

	yield { text: source.slice(pos, tailEnd), entities: clipEntities(entities, pos, tailEnd) };
}

/** eager {@link splitParts}: split into an array of `{ text, entities }` parts. */
export function splitText(text: SplitSource, max: number = MAX_MESSAGE_LENGTH): SplitPart[] {
	return [...splitParts(text, max)];
}

/** plain-string splitter — {@link splitText} without the entities. */
export function split(text: string, max: number = MAX_MESSAGE_LENGTH): string[] {
	return splitText(text, max).map((part) => part.text);
}

export interface SplitCaptionOptions {
	/** limit for the first part (the media caption). default {@link MAX_CAPTION_LENGTH}. */
	captionMax?: number;
	/** limit for the follow-up text parts. default {@link MAX_MESSAGE_LENGTH}. */
	max?: number;
}

/**
 * split for the caption strategy: the first part fits a media caption
 * ({@link MAX_CAPTION_LENGTH}), the rest fit regular messages ({@link MAX_MESSAGE_LENGTH}).
 */
export function splitCaption(text: SplitSource, options: SplitCaptionOptions = {}): SplitPart[] {
	const { captionMax = MAX_CAPTION_LENGTH, max = MAX_MESSAGE_LENGTH } = options;
	assertLimit(captionMax, "captionMax");
	assertLimit(max, "max");

	const source = typeof text === "string" ? text : text.text;
	const entities = typeof text === "string" ? [] : text.entities;

	if (source.length <= captionMax) return splitText(text, captionMax);

	const { end, next } = cutPoint(source, 0, captionMax);
	const head: SplitPart[] =
		end > 0 ? [{ text: source.slice(0, end), entities: clipEntities(entities, 0, end) }] : [];
	const rest: FormatResult = {
		text: source.slice(next),
		entities: clipEntities(entities, next, source.length),
	};

	return [...head, ...splitText(rest, max)];
}

/**
 * thrown when a multi-part send fails or is aborted midway. `sent` holds the results
 * that already went out, so the caller can resume, edit, or clean up.
 */
export class SplitSendError<Result = Message> extends Error {
	override name = "SplitSendError";

	constructor(
		message: string,
		/** results of the parts that were already delivered. */
		readonly sent: Result[],
		/** zero-based index of the part that failed (or was about to be sent when aborted). */
		readonly part: number,
		/** total number of parts. */
		readonly parts: number,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

/** per-part metadata handed to a {@link splitSend} action. */
export interface SplitPartInfo {
	/** zero-based part index. */
	index: number;
	/** total number of parts. */
	count: number;
	first: boolean;
	last: boolean;
}

export interface SplitSendOptions {
	/** max length of each part, in UTF-16 code units. default {@link MAX_MESSAGE_LENGTH}. */
	max?: number;
	/** pause between parts in milliseconds — keeps long chains under telegram's flood limits. */
	delayMs?: number;
	/** abort the remaining parts; the part already in flight still completes. */
	signal?: AbortSignal;
}

/** resolves after `ms`, or immediately when `signal` aborts — the caller re-checks the signal. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}
		const timer = setTimeout(finish, ms);
		function finish(): void {
			clearTimeout(timer);
			signal?.removeEventListener("abort", finish);
			resolve();
		}
		signal?.addEventListener("abort", finish, { once: true });
	});
}

/** sequential delivery loop shared by {@link splitSend} and the `ctx.*Long` methods. */
async function runParts<Result>(
	parts: readonly SplitPart[],
	action: (part: SplitPart, info: SplitPartInfo) => Result | Promise<Result>,
	{ delayMs = 0, signal }: SplitSendOptions,
): Promise<Result[]> {
	const sent: Result[] = [];
	const aborted = (index: number): SplitSendError<Result> =>
		new SplitSendError(
			`split: aborted after ${index} of ${parts.length} part(s)`,
			sent,
			index,
			parts.length,
			{ cause: signal?.reason },
		);

	for (const [index, part] of parts.entries()) {
		if (signal?.aborted) throw aborted(index);
		if (index > 0 && delayMs > 0) {
			await sleep(delayMs, signal);
			if (signal?.aborted) throw aborted(index);
		}

		try {
			sent.push(
				await action(part, {
					index,
					count: parts.length,
					first: index === 0,
					last: index === parts.length - 1,
				}),
			);
		} catch (error) {
			throw new SplitSendError(
				`split: part ${index + 1} of ${parts.length} failed`,
				sent,
				index,
				parts.length,
				{ cause: error },
			);
		}
	}

	return sent;
}

/**
 * framework-agnostic delivery: split `text` and run `action` for each part, in order.
 * returns the action results; a mid-chain failure throws {@link SplitSendError} carrying
 * the results delivered so far. the part is a valid `format` result, so inside yaebal
 * `(part) => ctx.send(part)` just works; elsewhere use `part.text` / `part.entities`.
 */
export function splitSend<Result>(
	text: SplitSource,
	action: (part: SplitPart, info: SplitPartInfo) => Result | Promise<Result>,
	options: SplitSendOptions = {},
): Promise<Result[]> {
	return runParts(splitText(text, options.max ?? MAX_MESSAGE_LENGTH), action, options);
}

export interface LongSendOptions extends SplitSendOptions {
	/** which parts get `extra.reply_markup`. default `"last"` — a keyboard belongs on the final message. */
	markup?: "last" | "first" | "all";
	/** which parts quote the original message in `replyLong`. default `"first"`. */
	replyTo?: "first" | "all";
	/** first-part limit for `sendPhotoLong` (the caption). default {@link MAX_CAPTION_LENGTH}. */
	captionMax?: number;
}

/** plugin-level defaults for {@link splitter} — every field can be overridden per call. */
export type SplitterOptions = LongSendOptions;

/** the methods {@link splitter} adds to the context. */
export interface SplitControl {
	/** send `text` (a string or a `format` result), split into telegram-sized messages. */
	sendLong(
		text: SplitSource,
		extra?: Record<string, unknown>,
		options?: LongSendOptions,
	): Promise<Message[]>;
	/** like `sendLong`, but the first part quotes the triggering message. */
	replyLong(
		text: SplitSource,
		extra?: Record<string, unknown>,
		options?: LongSendOptions,
	): Promise<Message[]>;
	/**
	 * caption strategy: send `photo` with the first part as its caption
	 * (≤ {@link MAX_CAPTION_LENGTH}), then the rest as regular messages.
	 */
	sendPhotoLong(
		photo: MediaSource | string,
		caption: SplitSource,
		extra?: Record<string, unknown>,
		options?: LongSendOptions,
	): Promise<Message[]>;
}

/**
 * `parse_mode` markup and whole-text `entities` in `extra` cannot survive a split —
 * tags would break at part boundaries and offsets would go stale. fail fast, before
 * anything is sent, instead of 400-ing halfway through the chain.
 */
function assertSplittable(extra: Record<string, unknown>, parts: number, method: string): void {
	if (parts <= 1) return;

	if (extra.parse_mode != null) {
		throw new TypeError(
			`${method}: parse_mode cannot be split safely — markup would break at part boundaries. ` +
				"build the text with format`...` instead; entities are split correctly.",
		);
	}
	if (extra.entities != null || extra.caption_entities != null) {
		throw new TypeError(
			`${method}: extra entities target the whole text and cannot be split. ` +
				"pass { text, entities } (a format result) as the text argument instead.",
		);
	}
}

/**
 * adds `ctx.sendLong` / `ctx.replyLong` / `ctx.sendPhotoLong` — send text of any length
 * as a chain of telegram-sized messages, `format` entities included.
 *
 * accepts a bare number (`splitter(2000)`) as a shorthand for `{ max: 2000 }`.
 */
export function splitter(options: number | SplitterOptions = {}): Plugin<Context, SplitControl> {
	const defaults: SplitterOptions = typeof options === "number" ? { max: options } : options;
	if (defaults.max !== undefined) assertLimit(defaults.max, "max");
	if (defaults.captionMax !== undefined) assertLimit(defaults.captionMax, "captionMax");

	return (composer) =>
		composer.derive((ctx) => {
			const wantsMarkup = (markup: "last" | "first" | "all", info: SplitPartInfo): boolean =>
				markup === "all" || (markup === "last" ? info.last : info.first);

			const deliver = (
				text: SplitSource,
				extra: Record<string, unknown>,
				overrides: LongSendOptions,
				method: "sendLong" | "replyLong",
			): Promise<Message[]> => {
				const opts: LongSendOptions = { ...defaults, ...overrides };
				const { markup = "last", replyTo = "first" } = opts;
				const { reply_markup, ...rest } = extra;

				const parts = splitText(text, opts.max ?? MAX_MESSAGE_LENGTH);
				assertSplittable(rest, parts.length, method);

				return runParts(
					parts,
					(part, info) => {
						const partExtra =
							reply_markup !== undefined && wantsMarkup(markup, info)
								? { ...rest, reply_markup }
								: rest;

						return method === "replyLong" && (replyTo === "all" || info.first)
							? ctx.reply(part, partExtra)
							: ctx.send(part, partExtra);
					},
					opts,
				);
			};

			const control: SplitControl = {
				sendLong: (text, extra = {}, options = {}) => deliver(text, extra, options, "sendLong"),
				replyLong: (text, extra = {}, options = {}) => deliver(text, extra, options, "replyLong"),

				async sendPhotoLong(photo, caption, extra = {}, options = {}) {
					const opts: LongSendOptions = { ...defaults, ...options };
					const { markup = "last" } = opts;
					const { reply_markup, ...rest } = extra;

					const parts = splitCaption(caption, {
						captionMax: opts.captionMax ?? MAX_CAPTION_LENGTH,
						max: opts.max ?? MAX_MESSAGE_LENGTH,
					});
					assertSplittable(rest, parts.length, "sendPhotoLong");

					// nothing but whitespace in the caption — still send the photo itself
					if (parts.length === 0) return [await ctx.sendPhoto(photo, extra)];

					return runParts(
						parts,
						(part, info) => {
							const partExtra =
								reply_markup !== undefined && wantsMarkup(markup, info)
									? { ...rest, reply_markup }
									: rest;

							return info.first
								? ctx.sendPhoto(photo, { ...partExtra, caption: part })
								: ctx.send(part, partExtra);
						},
						opts,
					);
				},
			};

			return control;
		});
}
