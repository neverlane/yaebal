import type { Context, Message, NextFn, Plugin } from "@yaebal/core";

/** the update kinds that can carry a `media_group_id`. */
export type MediaGroupUpdateName =
	| "message"
	| "edited_message"
	| "channel_post"
	| "edited_channel_post"
	| "business_message"
	| "edited_business_message";

/** called once per album, with every message in the group sorted by `message_id`. */
export type MediaGroupHandler<C extends Context = Context> = (
	ctx: C,
	messages: Message[],
) => unknown;

export interface MediaGroupOptions<C extends Context = Context> {
	/** how long to wait for the next album part before flushing. defaults to 200ms. */
	delayMs?: number;
	/**
	 * which update kinds are collected into albums. defaults to new messages only —
	 * `["message", "channel_post", "business_message"]`. edited updates pass through
	 * to the rest of the chain untouched unless listed here; each kind is collected
	 * into its own group, so an edit never merges into a freshly arriving album.
	 */
	updates?: readonly MediaGroupUpdateName[];
	/**
	 * called when the album handler (or, in pass-through mode, the downstream chain)
	 * throws. albums flush from a timer — outside the middleware chain — so without
	 * this the error would escape `bot.onError`. defaults to `console.error`.
	 */
	onError?: (error: unknown, ctx: C, messages: Message[]) => unknown;
}

/** what pass-through mode adds to the context (`Out` of the plugin). */
export interface MediaGroupExtension {
	/**
	 * every message of the album, sorted by `message_id` — present on the first
	 * update of a group in pass-through mode, `undefined` everywhere else.
	 */
	mediaGroup?: Message[];
}

/** the plugin function plus album controls. */
export type MediaGroupPlugin<
	In extends Context = Context,
	Out extends object = Record<never, never>,
> = Plugin<In, Out> & {
	/**
	 * flush every pending album now instead of waiting out the debounce — call it
	 * before shutdown (e.g. from `bot.onStop`) so a half-collected album isn't lost.
	 * resolves once all handlers settle.
	 */
	flush(): Promise<void>;
};

interface Group<C extends Context> {
	ctx: C;
	/** pass-through mode: the first update's `next`, resumed at flush time. */
	next: NextFn | undefined;
	messages: Message[];
	/** `message_id`s already collected — webhook retries can redeliver a part. */
	seen: Set<number>;
	timer: ReturnType<typeof setTimeout>;
}

/** an album holds at most 10 messages — the 10th part flushes without waiting. */
const MAX_ALBUM_SIZE = 10;

const DEFAULT_UPDATES: readonly MediaGroupUpdateName[] = [
	"message",
	"channel_post",
	"business_message",
];

/**
 * telegram delivers an album as separate updates sharing a `media_group_id`.
 * this buffers them (per update kind, chat and group id) and, after a short
 * debounce — or immediately once all 10 possible parts arrived — hands the
 * whole album over in one piece, sorted by `message_id`.
 *
 * two modes:
 * - `mediaGroup(handler)` — fires `handler(ctx, messages)` once per album;
 *   album parts are consumed and don't reach other handlers.
 * - `mediaGroup()` — pass-through: the first update of the album continues
 *   down the chain with `ctx.mediaGroup` set to the whole album, so filter
 *   queries and downstream plugins keep working; the other parts are consumed.
 *
 * `C` defaults to the base `Context`; installing after enriching plugins?
 * pin the handler's view explicitly: `mediaGroup<Context & { t: T }>(…)`.
 */
export function mediaGroup<C extends Context = Context>(
	handler: MediaGroupHandler<C>,
	options?: MediaGroupOptions<C>,
): MediaGroupPlugin<C>;
export function mediaGroup<C extends Context = Context>(
	options?: MediaGroupOptions<C>,
): MediaGroupPlugin<C, MediaGroupExtension>;
export function mediaGroup<C extends Context = Context>(
	handlerOrOptions?: MediaGroupHandler<C> | MediaGroupOptions<C>,
	maybeOptions?: MediaGroupOptions<C>,
): MediaGroupPlugin<C, MediaGroupExtension> {
	const handler = typeof handlerOrOptions === "function" ? handlerOrOptions : undefined;
	const options = (typeof handlerOrOptions === "function" ? maybeOptions : handlerOrOptions) ?? {};

	const delayMs = options.delayMs ?? 200;
	const kinds: ReadonlySet<string> = new Set(options.updates ?? DEFAULT_UPDATES);
	const onError =
		options.onError ??
		((error: unknown) => console.error("@yaebal/media-group: album handler threw", error));

	const groups = new Map<string, Group<C>>();

	const flush = async (key: string): Promise<void> => {
		const group = groups.get(key);
		if (!group) return;

		groups.delete(key);
		clearTimeout(group.timer);
		group.messages.sort((a, b) => a.message_id - b.message_id);

		try {
			if (handler) {
				await handler(group.ctx, group.messages);
			} else {
				(group.ctx as C & MediaGroupExtension).mediaGroup = group.messages;
				await group.next?.();
			}
		} catch (error) {
			try {
				await onError(error, group.ctx, group.messages);
			} catch (secondary) {
				console.error("@yaebal/media-group: onError itself threw", secondary);
			}
		}
	};

	const middleware = (ctx: C, next: NextFn) => {
		if (!kinds.has(ctx.updateType)) return next();

		const msg = ctx.update[ctx.updateType as MediaGroupUpdateName];
		const id = msg?.media_group_id;
		if (!msg || id === undefined) return next();

		// `media_group_id` is only unique within a chat (albums forwarded into a
		// linked discussion group keep the channel's id), and each update kind
		// collects separately so edits never pollute a new album.
		const key = `${ctx.updateType}:${msg.chat.id}:${id}`;

		const group = groups.get(key);
		if (!group) {
			groups.set(key, {
				ctx,
				next: handler ? undefined : next,
				messages: [msg],
				seen: new Set([msg.message_id]),
				timer: setTimeout(() => void flush(key), delayMs),
			});
			return; // buffered — flushes after the debounce
		}

		if (!group.seen.has(msg.message_id)) {
			group.seen.add(msg.message_id);
			group.messages.push(msg);
		}

		clearTimeout(group.timer);
		if (group.messages.length >= MAX_ALBUM_SIZE) return flush(key);
		group.timer = setTimeout(() => void flush(key), delayMs);
		// consumed — the album flushes as one
	};

	const plugin = ((composer) => composer.use(middleware)) as MediaGroupPlugin<
		C,
		MediaGroupExtension
	>;
	plugin.flush = () => Promise.all([...groups.keys()].map((key) => flush(key))).then(() => {});

	return plugin;
}
