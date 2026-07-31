import type { Api, Bot, BotPlugin, Context, FormatResult, Message } from "@yaebal/core";
import type { InlineKeyboardMarkup, MessageId, ReactionType } from "@yaebal/types";

/** text/caption accepted by the edit shortcuts — a plain string or a `format`/`fmt` result. */
type Text = string | FormatResult;
/** extra params spread onto the underlying api call (minus the ids hydrate fills in). */
type Extra = Record<string, unknown>;

/**
 * a reaction the {@link HydrateMessageMethods.react} shortcut accepts: a bare emoji
 * (or an array of them) is wrapped into `{ type: "emoji", emoji }`; a full
 * {@link ReactionType} passes through untouched (custom / paid reactions).
 */
export type HydrateReaction = string | ReactionType | (string | ReactionType)[];

/**
 * the methods hydrate attaches to every {@link Message} an api call returns. each one
 * targets *this* message — the chat id and message id come from the message itself, so a
 * hydrated message is self-contained (no `ctx` needed). the business connection the
 * message belongs to is threaded into the edit / pin calls automatically, matching how
 * `ctx.send` threads it for new messages.
 */
export interface HydrateMessageMethods {
	/** edit this message's text (`editMessageText`). resolves to the edited, re-hydrated message. */
	editText(text: Text, extra?: Extra): Promise<HydratedMessage | true>;
	/** edit this message's caption (`editMessageCaption`). */
	editCaption(caption: Text, extra?: Extra): Promise<HydratedMessage | true>;
	/** replace this message's inline keyboard (`editMessageReplyMarkup`); omit `replyMarkup` to clear it. */
	editReplyMarkup(
		replyMarkup?: InlineKeyboardMarkup,
		extra?: Extra,
	): Promise<HydratedMessage | true>;
	/** delete this message (`deleteMessage`). */
	delete(extra?: Extra): Promise<true>;
	/** pin this message in its chat (`pinChatMessage`). */
	pin(extra?: Extra): Promise<true>;
	/** unpin this message (`unpinChatMessage`). */
	unpin(extra?: Extra): Promise<true>;
	/** forward this message to another chat (`forwardMessage`). resolves to the new, hydrated message. */
	forward(chatId: number | string, extra?: Extra): Promise<HydratedMessage>;
	/** copy this message to another chat (`copyMessage`). resolves to the copy's `MessageId`. */
	copy(chatId: number | string, extra?: Extra): Promise<MessageId>;
	/** set the reaction on this message (`setMessageReaction`). */
	react(reaction: HydrateReaction, extra?: Extra): Promise<true>;
}

/** a {@link Message} with hydrate's {@link HydrateMessageMethods} attached. */
export type HydratedMessage = Message & HydrateMessageMethods;

/** added to every context: turn any message into a {@link HydratedMessage} (e.g. `ctx.callbackQuery.message`). */
export interface HydrateFlavor {
	/**
	 * attach hydrate's methods to a message the api didn't hand back directly — most often
	 * `ctx.callbackQuery.message`. idempotent: a message hydrate already touched is returned
	 * as-is, so it's safe to call on a value that may or may not be hydrated.
	 */
	hydrate<M extends Message>(message: M): M & HydrateMessageMethods;
}

/** marks a message hydrate already touched, so re-hydration is a no-op and stays out of JSON output. */
const HYDRATED: unique symbol = Symbol("yaebal.hydrate");

type Hydratable = Message & { [HYDRATED]?: true };

/** apis whose after-hook is already installed — install once, however many times `hydrate()` runs. */
const installed = new WeakSet<Api>();

function isMessage(value: unknown): value is Message {
	if (typeof value !== "object" || value === null) return false;

	const record = value as Record<string, unknown>;
	return (
		typeof record.message_id === "number" && typeof record.chat === "object" && record.chat !== null
	);
}

/** normalize the `react` sugar into the wire shape: bare emoji → `{ type: "emoji", emoji }`. */
function toReactions(reaction: HydrateReaction): ReactionType[] {
	const list = Array.isArray(reaction) ? reaction : [reaction];
	return list.map((item) => (typeof item === "string" ? { type: "emoji", emoji: item } : item));
}

/**
 * attach {@link HydrateMessageMethods} to `message`, binding them to `api` and to the
 * message's own chat / id. idempotent (guarded by {@link HYDRATED}) and non-mutating to the
 * message's own data — the methods are added as non-enumerable properties, so `JSON.stringify`
 * and object spreads see the plain telegram payload, not the helpers.
 */
export function hydrateMessage<M extends Message>(api: Api, message: M): M & HydrateMessageMethods {
	const target = message as M & Hydratable;
	if (target[HYDRATED]) return target as M & HydrateMessageMethods;

	const chatId = message.chat.id;
	const messageId = message.message_id;
	// route edits / pins through the same business connection new messages go through.
	const business = message.business_connection_id;
	const businessRouting: Extra = business === undefined ? {} : { business_connection_id: business };

	const call = <T>(method: string, params: Extra): Promise<T> => api.call<T>(method, params);

	const methods: HydrateMessageMethods = {
		editText: (text, extra = {}) =>
			call<HydratedMessage | true>("editMessageText", {
				chat_id: chatId,
				message_id: messageId,
				...businessRouting,
				...extra,
				text,
			}),
		editCaption: (caption, extra = {}) =>
			call<HydratedMessage | true>("editMessageCaption", {
				chat_id: chatId,
				message_id: messageId,
				...businessRouting,
				...extra,
				caption,
			}),
		editReplyMarkup: (replyMarkup, extra = {}) =>
			call<HydratedMessage | true>("editMessageReplyMarkup", {
				chat_id: chatId,
				message_id: messageId,
				...businessRouting,
				...extra,
				reply_markup: replyMarkup,
			}),
		delete: (extra = {}) =>
			call<true>("deleteMessage", { chat_id: chatId, message_id: messageId, ...extra }),
		pin: (extra = {}) =>
			call<true>("pinChatMessage", {
				chat_id: chatId,
				message_id: messageId,
				...businessRouting,
				...extra,
			}),
		unpin: (extra = {}) =>
			call<true>("unpinChatMessage", {
				chat_id: chatId,
				message_id: messageId,
				...businessRouting,
				...extra,
			}),
		forward: (chatId_, extra = {}) =>
			call<HydratedMessage>("forwardMessage", {
				chat_id: chatId_,
				from_chat_id: chatId,
				message_id: messageId,
				...extra,
			}),
		copy: (chatId_, extra = {}) =>
			call<MessageId>("copyMessage", {
				chat_id: chatId_,
				from_chat_id: chatId,
				message_id: messageId,
				...extra,
			}),
		react: (reaction, extra = {}) =>
			call<true>("setMessageReaction", {
				chat_id: chatId,
				message_id: messageId,
				reaction: toReactions(reaction),
				...extra,
			}),
	};

	const descriptors: PropertyDescriptorMap = { [HYDRATED]: { value: true } };
	for (const [name, fn] of Object.entries(methods)) {
		descriptors[name] = { value: fn, enumerable: false, writable: true, configurable: true };
	}
	Object.defineProperties(target, descriptors);

	return target as M & HydrateMessageMethods;
}

/** hydrate a single result (or each message in a `sendMediaGroup`-style array) in place. */
function hydrateResult(api: Api, result: unknown): void {
	if (Array.isArray(result)) {
		for (const item of result) if (isMessage(item)) hydrateMessage(api, item);
		return;
	}

	if (isMessage(result)) hydrateMessage(api, result);
}

/**
 * install hydrate's `api.after` hook directly on an {@link Api} client — the plugin-free form,
 * mirroring `autoRetry(bot.api)`. every message an api call returns (and every message in a
 * media-group array) comes back with {@link HydrateMessageMethods}. idempotent per client.
 */
export function hydrateApi(api: Api): Api {
	if (installed.has(api)) return api;
	installed.add(api);

	api.after((_method, _params, result) => {
		hydrateResult(api, result);
	});

	return api;
}

/**
 * hydrate api call results. every {@link Message} returned by `ctx.send` / `ctx.reply` /
 * `api.sendMessage` / … comes back with methods bound to it — `msg.editText("…")`,
 * `msg.delete()`, `msg.pin()`, `msg.forward(chatId)`, `msg.copy(chatId)`, `msg.react("👍")` —
 * so follow-up calls need no chat/message ids. also decorates the context with
 * {@link HydrateFlavor.hydrate} for messages the api didn't return directly (e.g. the callback
 * query's message).
 */
export function hydrate(): BotPlugin<Context, HydrateFlavor> {
	return <C extends Context>(bot: Bot<C>) => {
		hydrateApi(bot.api);

		// `derive`, not `decorate`: `ctx.api` is per-update (a webhook reply wraps the client per
		// request), so the helper binds to whatever client built this update — including a test mock.
		return bot.derive((ctx) => ({
			hydrate: <M extends Message>(message: M): M & HydrateMessageMethods =>
				hydrateMessage(ctx.api, message),
		})) as unknown as Bot<C & HydrateFlavor>;
	};
}
