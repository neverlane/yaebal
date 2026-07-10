/**
 * paginated lists over any data source, rendered into a telegram message with
 * inline navigation — and, optionally, a tappable button per item.
 *
 * ```ts
 * const users = pagination({
 *   id: "users",
 *   source: (ctx) => db.users.all(),            // array source: slice happens here
 *   line: (u, i) => `${i + 1}. ${u.name}`,      // text row (string or a `format` result)
 * });
 *
 * bot.install(users.plugin());                  // handles every button press
 * bot.command("users", (ctx) => users.send(ctx));
 * ```
 *
 * ## data sources
 *
 * an **array source** `(ctx, payload) => T[]` returns the whole list; the plugin slices.
 * a **lazy source** `{ fetch, count? }` asks only for the current page — `fetch` receives
 * `{ offset, limit, page, ctx, payload }`, so a database query paginates in the database.
 * with `count` the page total is exact (fetch + count run in parallel); without it the
 * plugin probes `limit + 1` rows to learn whether a next page exists.
 *
 * ## items as buttons
 *
 * `item` renders each row as an inline button; `onSelect` receives the tapped item's id
 * (string and number ids round-trip exactly), the page it was tapped on, and the payload.
 * `item` may also return a raw `InlineKeyboardButton` (url/web_app/own callback_data) —
 * those are passed through verbatim. `line` and `item` combine freely.
 *
 * ## payload
 *
 * `payload` is a `@yaebal/callback-data` schema fragment baked into every button, so one
 * instance serves parameterized lists ("products of category N") — the payload rides the
 * buttons, not server state, and survives restarts.
 *
 * ## failure model
 *
 * every callback query is answered (in `finally` — the spinner never hangs). a no-op edit
 * (`message is not modified`: double-tap, refresh) is swallowed. an uneditable message
 * (48h-old, deleted) falls back to sending the page as a new message. forged or stale
 * callback data (non-integer, negative, out-of-range pages) is clamped, never crashes.
 * page text is clamped to telegram's 4096-char limit, entities included.
 */

import {
	callbackData,
	Field,
	field,
	type InferInput,
	type InferOutput,
	type Schema,
} from "@yaebal/callback-data";
import {
	type CallbackQuery,
	type Context,
	type FormatResult,
	type Insertable,
	join,
	type Message,
	type MessageEntity,
	type Plugin,
} from "@yaebal/core";
import {
	InlineKeyboard,
	type InlineKeyboardButton,
	type InlineKeyboardMarkup,
} from "@yaebal/keyboard";

/** telegram's hard limit on message text, in utf-16 code units. */
const MAX_TEXT = 4096;

type EmptySchema = Record<never, never>;

/** the context a pagination button press is handled in. */
export type PaginationContext = Context & { callbackQuery: CallbackQuery };

/** what a lazy source's `fetch` receives — enough to paginate in the database. */
export interface PageQuery<P extends Schema = EmptySchema> {
	/** index of the first item to return. */
	offset: number;
	/** how many items to return (may be `pageSize + 1` — the extra row probes for a next page). */
	limit: number;
	/** 0-based page being fetched. */
	page: number;
	ctx: Context;
	payload: InferOutput<P>;
}

/** page-at-a-time source: `fetch` one page; `count` (optional) makes page totals exact. */
export interface LazySource<T, P extends Schema = EmptySchema> {
	fetch(query: PageQuery<P>): T[] | Promise<T[]>;
	count?(ctx: Context, payload: InferOutput<P>): number | Promise<number>;
}

/** whole-list source — the plugin slices. fine for in-memory data. */
export type ArraySource<T, P extends Schema = EmptySchema> = (
	ctx: Context,
	payload: InferOutput<P>,
) => T[] | Promise<T[]>;

export type Source<T, P extends Schema = EmptySchema> = ArraySource<T, P> | LazySource<T, P>;

/** everything known about the rendered page — fed to `header`/`empty`/`counter`/`keyboard`. */
export interface PageInfo<P extends Schema = EmptySchema> {
	/** 0-based current page (already clamped). */
	page: number;
	/** total pages — `undefined` for a lazy source without `count`. */
	pages: number | undefined;
	/** total items — `undefined` for a lazy source without `count`. */
	count: number | undefined;
	hasPrev: boolean;
	hasNext: boolean;
	payload: InferOutput<P>;
}

/** a selectable item button: the label shown and the id handed to `onSelect`. */
export interface PaginationItem {
	label: string;
	id: string | number;
}

/** what `onSelect` receives. */
export interface SelectEvent<P extends Schema = EmptySchema> {
	/** the id `item` gave the tapped button (type preserved: numbers stay numbers). */
	id: string | number;
	/** the page the button was tapped on — handy for a "back to the list" button. */
	page: number;
	payload: InferOutput<P>;
}

/** navigation button labels. */
export interface PaginationLabels {
	/** default `"◀"`. */
	prev?: string;
	/** default `"▶"`. */
	next?: string;
	/** default `"⏮"` (shown with `firstLast`). */
	first?: string;
	/** default `"⏭"` (shown with `firstLast`). */
	last?: string;
}

export interface PaginationOptions<T, P extends Schema = EmptySchema> {
	/** unique id — namespaces the callback_data so multiple lists don't clash. */
	id: string;
	/** items per page. defaults to 5. */
	pageSize?: number;
	/** where the items come from — an array source or a lazy `{ fetch, count? }`. */
	source: Source<T, P>;
	/** render one item to a text row. `index` is global across pages. */
	line?: (item: T, index: number, ctx: Context) => string | FormatResult;
	/**
	 * render one item to an inline button. return a string (label; the global index becomes
	 * the id), a `{ label, id }`, or a raw `InlineKeyboardButton` to pass through verbatim.
	 */
	item?: (item: T, index: number) => string | PaginationItem | InlineKeyboardButton;
	/** called when an item button is tapped. the query is answered automatically. */
	onSelect?: (ctx: PaginationContext, event: SelectEvent<P>) => unknown;
	/** item buttons per keyboard row. defaults to 1. */
	columns?: number;
	/** page header. defaults to `"page N/M"` (`"page N"` when the total is unknown). */
	header?: (info: PageInfo<P>, ctx: Context) => string | FormatResult;
	/** shown instead of the page when there are no items. defaults to `"nothing here"`. */
	empty?: string | FormatResult | ((info: PageInfo<P>, ctx: Context) => string | FormatResult);
	/**
	 * extra `@yaebal/callback-data` fields carried by every button. `"$"`-prefixed names
	 * are reserved. pass the values via `send(ctx, { payload })`.
	 */
	payload?: P;
	/** navigation button labels. */
	labels?: PaginationLabels;
	/** add ⏮ / ⏭ jump buttons (⏭ needs a known page total). defaults to false. */
	firstLast?: boolean;
	/**
	 * put a `"N/M"` button between prev/next. pressing it re-renders the page, so it
	 * doubles as a refresh button. pass a function to format the label. defaults to false.
	 */
	counter?: boolean | ((info: PageInfo<P>) => string);
	/** reshape the keyboard after the plugin builds it — append rows, wrap, or replace. */
	keyboard?: (
		kb: InlineKeyboard,
		info: PageInfo<P>,
		ctx: Context,
		// biome-ignore lint/suspicious/noConfusingVoidType: allows mutate-in-place hooks that return nothing
	) => InlineKeyboard | undefined | void;
	/**
	 * gate button presses. receives the button's decoded payload, so ownership can ride
	 * the buttons themselves: `filter: (ctx, p) => ctx.from?.id === p.owner`.
	 */
	filter?: (ctx: PaginationContext, payload: InferOutput<P>) => boolean | Promise<boolean>;
	/** toast shown when `filter` rejects a press. */
	denied?: string;
}

/** a rendered page — returned by `view()` for embedding into your own send/edit flows. */
export interface PageView<T, P extends Schema = EmptySchema> extends PageInfo<P> {
	text: string;
	entities?: MessageEntity[];
	markup: InlineKeyboardMarkup;
	/** the items on this page. */
	items: T[];
}

// biome-ignore lint/complexity/noBannedTypes: `{} extends I` is the standard "every field is optional" probe
type AllOptional<I> = {} extends I ? true : false;

type PageOpts<P extends Schema> = { page?: number } & (AllOptional<InferInput<P>> extends true
	? { payload?: InferInput<P> }
	: { payload: InferInput<P> });

/** `send`/`view`/`button` args — the payload becomes required when the schema requires it. */
export type PageArgs<P extends Schema> =
	AllOptional<InferInput<P>> extends true
		? [pageOrOpts?: number | PageOpts<P>]
		: [opts: PageOpts<P>];

type EditOpts<P extends Schema> = PageOpts<P> & {
	chatId?: number;
	messageId?: number;
	inlineMessageId?: string;
};

/** `edit` args — like {@link PageArgs} plus an optional explicit edit target. */
export type EditArgs<P extends Schema> =
	AllOptional<InferInput<P>> extends true
		? [pageOrOpts?: number | EditOpts<P>]
		: [opts: EditOpts<P>];

export interface Pagination<T, P extends Schema = EmptySchema> {
	/** the plugin that handles this list's button presses — `bot.install(list.plugin())`. */
	plugin(): Plugin<Context, EmptySchema>;
	/** send the page as a new message to the update's chat. */
	send(ctx: Context, ...args: PageArgs<P>): Promise<Message>;
	/**
	 * re-render the page into an existing message — the current callback-query message by
	 * default, or an explicit `chatId`/`messageId` (or `inlineMessageId`) target.
	 * a no-op edit resolves to `true` instead of throwing.
	 */
	edit(ctx: Context, ...args: EditArgs<P>): Promise<Message | true>;
	/** render without sending — text, entities, markup, items, and page info. */
	view(ctx: Context, ...args: PageArgs<P>): Promise<PageView<T, P>>;
	/**
	 * a button that opens this list at `page` when pressed — embed it in any keyboard
	 * (a menu, another list's `keyboard` hook, an inline-query result). the pressed
	 * message is edited into the list in place.
	 */
	button(label: string, ...args: PageArgs<P>): InlineKeyboardButton;
}

// ── error triage ─────────────────────────────────────────────────────────────

function describeError(error: unknown): string {
	const e = error as { description?: unknown; message?: unknown };
	return String(e?.description ?? e?.message ?? error);
}

/** telegram's answer to a no-op edit (double-tap, refresh) — expected, not a failure. */
function isNotModified(error: unknown): boolean {
	return /message is not modified/i.test(describeError(error));
}

/** the message is beyond editing (48h-old, deleted) — the page is re-sent instead. */
function isUneditable(error: unknown): boolean {
	return /can't be edited|message to edit not found/i.test(describeError(error));
}

// ── text assembly ────────────────────────────────────────────────────────────

const toFormat = (value: string | FormatResult): FormatResult =>
	typeof value === "string" ? { text: value, entities: [] } : value;

/** hard-clamp text to `max` utf-16 units, clipping entities to the kept range. */
function clampText(result: FormatResult, max: number): FormatResult {
	if (result.text.length <= max) return result;

	const keep = max - 1; // leave room for the ellipsis
	const entities = result.entities
		.filter((e) => e.offset < keep)
		.map((e) => (e.offset + e.length <= keep ? e : { ...e, length: keep - e.offset }));

	return { text: `${result.text.slice(0, keep)}…`, entities };
}

// ── the factory ──────────────────────────────────────────────────────────────

export function pagination<T>(
	options: PaginationOptions<T, EmptySchema> & { payload?: undefined },
): Pagination<T, EmptySchema>;
export function pagination<T, const P extends Schema>(
	options: PaginationOptions<T, P> & { payload: P },
): Pagination<T, P>;
export function pagination<T, const P extends Schema = EmptySchema>(
	options: PaginationOptions<T, P>,
): Pagination<T, P> {
	const { id, source, line, item, onSelect, filter, denied, keyboard: keyboardHook } = options;
	const pageSize = options.pageSize ?? 5;
	const columns = options.columns ?? 1;
	const labels = {
		prev: options.labels?.prev ?? "◀",
		next: options.labels?.next ?? "▶",
		first: options.labels?.first ?? "⏮",
		last: options.labels?.last ?? "⏭",
	};

	if (id.length === 0) throw new Error("pagination: id must not be empty");
	if (id.includes(":") || id.includes("\\")) {
		throw new Error(`pagination: id "${id}" must not contain ":" or "\\"`);
	}
	if (!Number.isInteger(pageSize) || pageSize < 1) {
		throw new RangeError(`pagination("${id}"): pageSize must be a positive integer`);
	}
	if (!Number.isInteger(columns) || columns < 1) {
		throw new RangeError(`pagination("${id}"): columns must be a positive integer`);
	}
	if (!line && !item) {
		throw new Error(`pagination("${id}"): provide line (text rows), item (buttons), or both`);
	}
	for (const key of Object.keys(options.payload ?? {})) {
		if (key.startsWith("$")) {
			throw new Error(`pagination("${id}"): payload field "${key}" — "$" names are reserved`);
		}
	}

	const payloadSchema = (options.payload ?? {}) as Schema;
	const nav = callbackData(`pg_${id}`, { $page: Number, ...payloadSchema });
	const sel = callbackData(`pgs_${id}`, {
		$page: Number,
		$sid: field.string().optional(),
		$nid: field.number().optional(),
		...payloadSchema,
	});

	type Payload = InferOutput<P>;
	type NavData = Record<string, unknown> & { $page: number };
	type SelData = NavData & { $sid?: string; $nid?: number };

	const packNav = (page: number, payload: Record<string, unknown>): string =>
		nav.pack({ $page: page, ...payload } as Parameters<typeof nav.pack>[0]);

	const packSel = (sid: string | number, page: number, payload: Record<string, unknown>): string =>
		sel.pack({
			$page: page,
			...(typeof sid === "number" ? { $nid: sid } : { $sid: sid }),
			...payload,
		} as Parameters<typeof sel.pack>[0]);

	/** fill in schema defaults so `source`/`header` always see the unpacked shape. */
	const materialize = (input: Record<string, unknown>): Payload => {
		const out = { ...input };
		for (const [key, codec] of Object.entries(payloadSchema)) {
			if (out[key] === undefined && codec instanceof Field && codec.spec.hasDefault) {
				out[key] = codec.spec.default;
			}
		}
		return out as Payload;
	};

	const normalize = (
		arg: number | { page?: number; payload?: unknown } | undefined,
	): { page: number; payload: Record<string, unknown> } =>
		typeof arg === "number"
			? { page: arg, payload: {} }
			: { page: arg?.page ?? 0, payload: (arg?.payload as Record<string, unknown>) ?? {} };

	/** hostile or stale pages (fractions, negatives, out-of-range) clamp instead of crashing. */
	const clampPage = (page: number, pages?: number): number => {
		const p = Number.isInteger(page) && page > 0 ? page : 0;
		return pages === undefined ? p : Math.min(p, pages - 1);
	};

	interface Loaded {
		items: T[];
		page: number;
		pages: number | undefined;
		count: number | undefined;
		hasNext: boolean;
	}

	const fetchPage = (ctx: Context, payload: Payload, page: number, limit: number) =>
		(source as LazySource<T, P>).fetch({ offset: page * pageSize, limit, page, ctx, payload });

	const load = async (ctx: Context, payload: Payload, rawPage: number): Promise<Loaded> => {
		// array source: the whole list is here — slice it
		if (typeof source === "function") {
			const all = await source(ctx, payload);
			const pages = Math.max(1, Math.ceil(all.length / pageSize));
			const page = clampPage(rawPage, pages);

			return {
				items: all.slice(page * pageSize, page * pageSize + pageSize),
				page,
				pages,
				count: all.length,
				hasNext: page < pages - 1,
			};
		}

		// lazy + count: fetch and count in parallel; a stale page refetches once, clamped
		if (source.count) {
			let page = clampPage(rawPage);
			let [count, items] = await Promise.all([
				source.count(ctx, payload),
				fetchPage(ctx, payload, page, pageSize),
			]);
			const pages = Math.max(1, Math.ceil(count / pageSize));

			if (page > pages - 1) {
				page = pages - 1;
				items = await fetchPage(ctx, payload, page, pageSize);
			}

			return { items, page, pages, count, hasNext: page < pages - 1 };
		}

		// lazy without count: probe limit + 1 to learn whether a next page exists
		let page = clampPage(rawPage);
		let got = await fetchPage(ctx, payload, page, pageSize + 1);

		if (got.length === 0 && page > 0) {
			// stale button beyond the end of a shrunken list — retreat to the first page
			page = 0;
			got = await fetchPage(ctx, payload, 0, pageSize + 1);
		}

		const hasNext = got.length > pageSize;
		const items = got.slice(0, pageSize);

		return {
			items,
			page,
			// reaching the last page reveals the real totals — the header upgrades to "N/M"
			pages: hasNext ? undefined : page + 1,
			count: hasNext ? undefined : page * pageSize + items.length,
			hasNext,
		};
	};

	const infoOf = (loaded: Loaded, payload: Payload): PageInfo<P> => ({
		page: loaded.page,
		pages: loaded.pages,
		count: loaded.count,
		hasPrev: loaded.page > 0,
		hasNext: loaded.hasNext,
		payload,
	});

	const defaultHeader = (info: PageInfo<P>): string =>
		info.pages !== undefined ? `page ${info.page + 1}/${info.pages}` : `page ${info.page + 1}`;

	const renderText = (loaded: Loaded, info: PageInfo<P>, ctx: Context): FormatResult => {
		if (loaded.items.length === 0) {
			const value =
				typeof options.empty === "function"
					? options.empty(info, ctx)
					: (options.empty ?? "nothing here");
			return clampText(toFormat(value), MAX_TEXT);
		}

		const head = toFormat((options.header ?? defaultHeader)(info, ctx));
		const parts: Insertable[] = [];
		if (head.text.length > 0) parts.push(head);
		if (line) {
			parts.push(join(loaded.items, (it, i) => line(it, loaded.page * pageSize + i, ctx), "\n"));
		}
		if (parts.every((p) => toFormat(p as string | FormatResult).text.length === 0)) {
			parts.push(defaultHeader(info)); // header opted out, no lines — never send empty text
		}

		return clampText(join(parts, "\n\n"), MAX_TEXT);
	};

	const itemButton = (
		spec: string | PaginationItem | InlineKeyboardButton,
		index: number,
		page: number,
		payload: Record<string, unknown>,
	): InlineKeyboardButton => {
		if (typeof spec === "string")
			return { text: spec, callback_data: packSel(index, page, payload) };
		if ("label" in spec && "id" in spec) {
			if (typeof spec.id !== "string" && typeof spec.id !== "number") {
				throw new TypeError(`pagination("${id}"): item id must be a string or a number`);
			}
			return { text: spec.label, callback_data: packSel(spec.id, page, payload) };
		}
		return spec; // a raw button (url / web_app / own callback_data) — pass through
	};

	const renderKeyboard = (
		loaded: Loaded,
		info: PageInfo<P>,
		ctx: Context,
		payload: Record<string, unknown>,
	): InlineKeyboardMarkup => {
		const kb = new InlineKeyboard();

		if (item && loaded.items.length > 0) {
			kb.columns(columns);
			loaded.items.forEach((it, i) => {
				const index = loaded.page * pageSize + i;
				kb.add(itemButton(item(it, index), index, loaded.page, payload));
			});
			kb.row().columns(undefined);
		}

		if (loaded.items.length > 0) {
			if (options.firstLast && info.hasPrev) kb.text(labels.first, packNav(0, payload));
			if (info.hasPrev) kb.text(labels.prev, packNav(loaded.page - 1, payload));

			const counter = options.counter;
			if (counter) {
				const label =
					typeof counter === "function"
						? counter(info)
						: info.pages !== undefined
							? `${loaded.page + 1}/${info.pages}`
							: `${loaded.page + 1}`;
				kb.text(label, packNav(loaded.page, payload)); // same-page nav — doubles as refresh
			}

			if (info.hasNext) kb.text(labels.next, packNav(loaded.page + 1, payload));
			if (options.firstLast && info.hasNext && info.pages !== undefined) {
				kb.text(labels.last, packNav(info.pages - 1, payload));
			}
		}

		return (keyboardHook?.(kb, info, ctx) ?? kb).build();
	};

	const buildView = async (
		ctx: Context,
		rawPage: number,
		payloadIn: Record<string, unknown>,
	): Promise<PageView<T, P>> => {
		const payload = materialize(payloadIn);
		const loaded = await load(ctx, payload, rawPage);
		const info = infoOf(loaded, payload);
		const body = renderText(loaded, info, ctx);
		const markup = renderKeyboard(loaded, info, ctx, payload);

		return {
			...info,
			text: body.text,
			...(body.entities.length > 0 ? { entities: body.entities } : {}),
			markup,
			items: loaded.items,
		};
	};

	// ── delivery ───────────────────────────────────────────────────────────────

	type EditTarget = { chat_id: number; message_id: number } | { inline_message_id: string };

	const editTargetOf = (ctx: Context, explicit?: EditOpts<P>): EditTarget | undefined => {
		if (explicit?.inlineMessageId !== undefined) {
			return { inline_message_id: explicit.inlineMessageId };
		}
		if (explicit?.chatId !== undefined && explicit?.messageId !== undefined) {
			return { chat_id: explicit.chatId, message_id: explicit.messageId };
		}

		const cb = ctx.callbackQuery;
		if (cb?.message && ctx.chat) return { chat_id: ctx.chat.id, message_id: cb.message.message_id };
		if (cb?.inline_message_id !== undefined) return { inline_message_id: cb.inline_message_id };
		return undefined;
	};

	const editWith = (ctx: Context, v: PageView<T, P>, target: EditTarget): Promise<Message | true> =>
		ctx.api.call<Message | true>("editMessageText", {
			...target,
			text: v.text,
			...(v.entities ? { entities: v.entities } : {}),
			reply_markup: v.markup,
			// business messages must be edited through the same connection
			...("chat_id" in target ? ctx.businessRouting() : {}),
		});

	const sendView = (ctx: Context, v: PageView<T, P>): Promise<Message> =>
		v.entities
			? ctx.send({ text: v.text, entities: v.entities }, { reply_markup: v.markup })
			: ctx.send(v.text, { reply_markup: v.markup });

	const deny = (ctx: Context): Promise<unknown> =>
		ctx.answerCallbackQuery(denied !== undefined ? { text: denied } : {}).catch(() => {});

	// ── button-press handlers ────────────────────────────────────────────────────

	const onNav = async (ctx: Context & { queryData: unknown; callbackQuery: CallbackQuery }) => {
		const { $page, ...payload } = ctx.queryData as NavData;
		if (filter && !(await filter(ctx, payload as Payload))) return deny(ctx);

		try {
			const v = await buildView(ctx, $page, payload);
			const target = editTargetOf(ctx);
			if (!target) return;

			try {
				await editWith(ctx, v, target);
			} catch (error) {
				if (isNotModified(error)) return;
				if (isUneditable(error)) {
					// the message outlived its editability — deliver the page fresh instead
					if ("chat_id" in target) await sendView(ctx, v);
					return;
				}
				throw error;
			}
		} finally {
			await ctx.answerCallbackQuery().catch(() => {});
		}
	};

	const onSel = async (ctx: Context & { queryData: unknown; callbackQuery: CallbackQuery }) => {
		const { $page, $sid, $nid, ...payload } = ctx.queryData as SelData;
		if (filter && !(await filter(ctx, payload as Payload))) return deny(ctx);

		try {
			const selected = $nid ?? $sid;
			if (selected === undefined || !onSelect) return;

			await onSelect(ctx, { id: selected, page: $page, payload: payload as Payload });
		} finally {
			await ctx.answerCallbackQuery().catch(() => {});
		}
	};

	// ── public surface ───────────────────────────────────────────────────────────

	return {
		plugin(): Plugin<Context, EmptySchema> {
			return (composer) => {
				composer.callbackQuery(nav, onNav);
				// item buttons are answered even without onSelect, so the spinner never hangs
				if (item) composer.callbackQuery(sel, onSel);
				return composer;
			};
		},

		async send(ctx, ...args) {
			const { page, payload } = normalize(args[0]);
			return sendView(ctx, await buildView(ctx, page, payload));
		},

		async edit(ctx, ...args) {
			const { page, payload } = normalize(args[0]);
			const explicit = typeof args[0] === "object" ? (args[0] as EditOpts<P>) : undefined;
			const target = editTargetOf(ctx, explicit);
			if (!target) {
				throw new Error(
					`pagination("${id}").edit(): no message to edit — call from a callback-query context or pass chatId/messageId (or inlineMessageId)`,
				);
			}

			const v = await buildView(ctx, page, payload);
			try {
				return await editWith(ctx, v, target);
			} catch (error) {
				if (isNotModified(error)) return true;
				throw error;
			}
		},

		view(ctx, ...args) {
			const { page, payload } = normalize(args[0]);
			return buildView(ctx, page, payload);
		},

		button(label, ...args) {
			const { page, payload } = normalize(args[0]);
			return { text: label, callback_data: packNav(page, payload) };
		},
	};
}
