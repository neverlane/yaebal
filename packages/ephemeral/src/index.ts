import type { Context, FormatResult, Plugin } from "@yaebal/core";
import type { Chat, InlineKeyboardMarkup, Message } from "@yaebal/types";

/** text accepted everywhere core's `send`/`reply` accepts it: a plain string or a `format` result. */
export type EphemeralText = string | FormatResult;

/** the slice of the api client this plugin needs (satisfied by `ctx.api` / `bot.api`). */
export interface EphemeralApi {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * what `replyEphemeral` does outside group/supergroup chats, where telegram has no
 * ephemeral messages:
 *
 * - `"message"` (default): in a private chat, send a normal message instead — it is already
 *   visible to that user only, and the returned handle keeps the same interface (backed by
 *   `editMessageText`/`deleteMessage`). one code path for "answer only the asker" anywhere.
 * - `"error"`: reject, so the caller decides.
 *
 * channels always reject — a normal channel post is visible to everyone, silently downgrading
 * an "only you can see this" reply there would be a privacy bug, not a fallback.
 */
export type EphemeralFallback = "message" | "error";

/**
 * what a handle's `edit`/`editReplyMarkup` does when the ephemeral message already expired
 * (telegram forgets them quickly, and their ids may be reused):
 *
 * - `"throw"` (default): rethrow the telegram error.
 * - `"ignore"`: resolve `false` — the edit just didn't land.
 * - `"resend"`: send the new content as a fresh ephemeral message to the same receiver and
 *   retarget the handle at it.
 */
export type EphemeralExpiredAction = "throw" | "ignore" | "resend";

export interface EphemeralOptions {
	/** see {@link EphemeralFallback}. default `"message"`. */
	fallback?: EphemeralFallback;
	/** see {@link EphemeralExpiredAction}. default `"throw"`. */
	onExpired?: EphemeralExpiredAction;
	/** override how an "expired/gone" telegram error is recognized. default {@link isExpiredEphemeralError}. */
	isExpiredError?: (error: unknown) => boolean;
}

/**
 * a live handle over one sent ephemeral message (or its private-chat fallback message).
 *
 * do NOT persist it (or its ids) in a session or database: telegram reuses
 * `ephemeral_message_id`s after a message expires or is deleted, so a stored id may later
 * point at a different message entirely. the handle is for the lifetime of the current
 * operation only.
 */
export interface EphemeralMessage {
	/** `false` when the private-chat fallback produced a normal message instead. */
	readonly isEphemeral: boolean;
	readonly chatId: number;
	readonly receiverUserId: number;
	/** current ephemeral message id — may change after an `onExpired: "resend"` recovery. */
	readonly ephemeralMessageId: number | undefined;
	/** the plain `message_id`, on the fallback path only. */
	readonly messageId: number | undefined;
	/**
	 * replace the message text (`editEphemeralMessageText` / fallback `editMessageText`).
	 * `extra` passes through (`reply_markup`, `link_preview_options`, `parse_mode`, …).
	 * resolves `false` if the edit was skipped by the `onExpired: "ignore"` policy.
	 */
	edit(text: EphemeralText, extra?: Record<string, unknown>): Promise<boolean>;
	/** replace (or clear, with `undefined`) just the inline keyboard. */
	editReplyMarkup(replyMarkup: InlineKeyboardMarkup | undefined): Promise<boolean>;
	/** delete the message. resolves `false` (never throws) if it was already gone. */
	delete(): Promise<boolean>;
}

/** added to every context by {@link ephemeral}. */
export interface EphemeralControl {
	/**
	 * answer the update's author so only they (and the bot) see it. in group/supergroup
	 * chats this sends a real ephemeral message; in a private chat it falls back per
	 * {@link EphemeralFallback}. delivery is best-effort — telegram does not guarantee an
	 * offline user ever receives it, so never gate required flows on an ephemeral reply.
	 */
	replyEphemeral(text: EphemeralText, extra?: Record<string, unknown>): Promise<EphemeralMessage>;
	/**
	 * send an ephemeral message to a specific user in the current group/supergroup —
	 * e.g. a private nudge to an admin. no fallback: outside group/supergroup chats this
	 * rejects, because a normal message there would be visible to the whole chat.
	 */
	sendEphemeral(
		receiverUserId: number,
		text: EphemeralText,
		extra?: Record<string, unknown>,
	): Promise<EphemeralMessage>;
}

/** ephemeral messages exist in group and supergroup chats only. */
export function supportsEphemeral(chat: Pick<Chat, "type"> | undefined): boolean {
	return chat?.type === "group" || chat?.type === "supergroup";
}

/**
 * the default "this ephemeral message is gone" detector: a telegram 400 whose description
 * says the message wasn't found / expired / has an invalid id. structural (`code` +
 * `description`), so it works on `TelegramError` from any copy of `@yaebal/core`.
 */
export function isExpiredEphemeralError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const { code, description } = error as { code?: unknown; description?: unknown };

	return (
		code === 400 &&
		typeof description === "string" &&
		/not found|expired|invalid/i.test(description)
	);
}

function resolveText(text: EphemeralText): { text: string; entities?: FormatResult["entities"] } {
	if (typeof text === "string") return { text };
	return { text: text.text, entities: text.entities };
}

interface HandleState {
	api: EphemeralApi;
	chatId: number;
	receiverUserId: number;
	/** `ephemeral_message_id`, or the plain `message_id` on the fallback path. */
	id: number;
	isEphemeral: boolean;
	/** last text this handle knows the message holds — fuels `editReplyMarkup`'s resend. */
	lastText: string | undefined;
	/** routing fragment (topic/business ids) reused when a resend recovery sends anew. */
	routing: Record<string, unknown>;
	onExpired: EphemeralExpiredAction;
	isExpired: (error: unknown) => boolean;
}

function makeHandle(state: HandleState): EphemeralMessage {
	const address = (): Record<string, unknown> =>
		state.isEphemeral
			? {
					chat_id: state.chatId,
					receiver_user_id: state.receiverUserId,
					ephemeral_message_id: state.id,
				}
			: { chat_id: state.chatId, message_id: state.id };

	const resend = async (params: Record<string, unknown>): Promise<boolean> => {
		const sent = await state.api.call<Message>("sendMessage", {
			chat_id: state.chatId,
			...(state.isEphemeral ? { receiver_user_id: state.receiverUserId } : {}),
			...state.routing,
			...params,
		});

		const id = state.isEphemeral ? sent.ephemeral_message_id : sent.message_id;
		if (id !== undefined) state.id = id;
		return true;
	};

	const attempt = async (
		method: string,
		params: Record<string, unknown>,
		recover?: () => Promise<boolean>,
	): Promise<boolean> => {
		try {
			await state.api.call(method, { ...address(), ...params });
			return true;
		} catch (error) {
			if (!state.isExpired(error) || state.onExpired === "throw") throw error;
			if (state.onExpired === "resend" && recover) return recover();
			return false;
		}
	};

	return {
		get isEphemeral() {
			return state.isEphemeral;
		},
		get chatId() {
			return state.chatId;
		},
		get receiverUserId() {
			return state.receiverUserId;
		},
		get ephemeralMessageId() {
			return state.isEphemeral ? state.id : undefined;
		},
		get messageId() {
			return state.isEphemeral ? undefined : state.id;
		},

		async edit(text, extra = {}) {
			const resolved = resolveText(text);
			const params = { ...resolved, ...extra };
			const ok = await attempt(
				state.isEphemeral ? "editEphemeralMessageText" : "editMessageText",
				params,
				() => resend(params),
			);

			if (ok) state.lastText = resolved.text;
			return ok;
		},

		editReplyMarkup(replyMarkup) {
			const params = replyMarkup === undefined ? {} : { reply_markup: replyMarkup };
			const last = state.lastText;

			return attempt(
				state.isEphemeral ? "editEphemeralMessageReplyMarkup" : "editMessageReplyMarkup",
				params,
				// a markup-only resend has to carry text too; without a known last text
				// there is nothing faithful to send, so fall back to "ignore".
				last === undefined ? undefined : () => resend({ text: last, ...params }),
			);
		},

		async delete() {
			try {
				await state.api.call(
					state.isEphemeral ? "deleteEphemeralMessage" : "deleteMessage",
					address(),
				);
				return true;
			} catch (error) {
				// deleting something already gone is success in every caller's book — stay idempotent.
				if (state.isExpired(error)) return false;
				throw error;
			}
		},
	};
}

/**
 * wrap an already-sent ephemeral `Message` (e.g. from a raw `api.call("sendMessage", ...)`
 * with `receiver_user_id`) in an {@link EphemeralMessage} handle.
 */
export function wrapEphemeralMessage(
	api: EphemeralApi,
	sent: Message,
	options: Pick<EphemeralOptions, "onExpired" | "isExpiredError"> = {},
): EphemeralMessage {
	const id = sent.ephemeral_message_id;
	const receiverUserId = sent.receiver_user?.id;
	if (id === undefined || receiverUserId === undefined)
		throw new TypeError(
			"@yaebal/ephemeral: wrapEphemeralMessage() needs a message with ephemeral_message_id and receiver_user",
		);

	return makeHandle({
		api,
		chatId: sent.chat.id,
		receiverUserId,
		id,
		isEphemeral: true,
		lastText: sent.text,
		routing: {},
		onExpired: options.onExpired ?? "throw",
		isExpired: options.isExpiredError ?? isExpiredEphemeralError,
	});
}

/**
 * installs `ctx.replyEphemeral()` / `ctx.sendEphemeral()` — see {@link EphemeralControl}.
 * ephemeral messages are best-effort by design: ids are reused, delivery to offline users
 * is not guaranteed, and edits/deletes may not reach the receiver. treat them as UI sugar,
 * never as state.
 */
export function ephemeral(options: EphemeralOptions = {}): Plugin<Context, EphemeralControl> {
	const fallback = options.fallback ?? "message";
	const onExpired = options.onExpired ?? "throw";
	const isExpired = options.isExpiredError ?? isExpiredEphemeralError;

	return (composer) =>
		composer.derive((ctx) => {
			const sendEphemeralTo = async (
				receiverUserId: number,
				text: EphemeralText,
				extra: Record<string, unknown>,
			): Promise<EphemeralMessage> => {
				const chat = ctx.chat;
				if (chat === undefined || !supportsEphemeral(chat))
					throw new Error(
						"@yaebal/ephemeral: ephemeral messages exist only in group and supergroup chats",
					);

				const resolved = resolveText(text);
				const routing = ctx.routing();
				const sent = await ctx.api.call<Message>("sendMessage", {
					chat_id: chat.id,
					receiver_user_id: receiverUserId,
					...routing,
					...resolved,
					...extra,
				});

				const id = sent.ephemeral_message_id;
				if (id === undefined)
					throw new Error(
						"@yaebal/ephemeral: telegram returned no ephemeral_message_id — the chat may not support ephemeral messages",
					);

				return makeHandle({
					api: ctx.api,
					chatId: chat.id,
					receiverUserId,
					id,
					isEphemeral: true,
					lastText: resolved.text,
					routing,
					onExpired,
					isExpired,
				});
			};

			const control: EphemeralControl = {
				sendEphemeral(receiverUserId, text, extra = {}) {
					return sendEphemeralTo(receiverUserId, text, extra);
				},

				async replyEphemeral(text, extra = {}) {
					const receiverUserId = ctx.from?.id;
					if (receiverUserId === undefined)
						throw new Error("@yaebal/ephemeral: replyEphemeral() — no user in this update");

					const chat = ctx.chat;
					if (chat !== undefined && supportsEphemeral(chat))
						return sendEphemeralTo(receiverUserId, text, extra);

					if (chat?.type !== "private" || fallback === "error")
						throw new Error(
							"@yaebal/ephemeral: ephemeral messages exist only in group and supergroup chats" +
								(chat?.type === "private" ? ' (fallback: "error" is set)' : ""),
						);

					// a normal private-chat message is already visible to exactly this user —
					// same guarantee, delivered reliably, behind the same handle interface.
					const sent = await ctx.send(text, extra);
					return makeHandle({
						api: ctx.api,
						chatId: chat.id,
						receiverUserId,
						id: sent.message_id,
						isEphemeral: false,
						lastText: resolveText(text).text,
						routing: ctx.routing(),
						onExpired,
						isExpired,
					});
				},
			};

			return control;
		});
}
