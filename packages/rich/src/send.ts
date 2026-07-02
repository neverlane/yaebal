import type { Api, Context, Message, Plugin } from "@yaebal/core";
import type { InputRichMessage } from "@yaebal/types";
import { RichMessageDraft, type RichMessageDraftOptions } from "./draft.js";

function toInput(input: InputRichMessage | string): InputRichMessage {
	return typeof input === "string" ? { html: input } : input;
}

/**
 * `sendRichMessage` — standalone, no plugin install required (the `@yaebal/fmt` /
 * `@yaebal/keyboard` "pure helper" style). `extra` covers the rest of
 * `SendRichMessageParams`: `reply_markup`, `reply_parameters`,
 * `message_effect_id`, `disable_notification`, `protect_content`,
 * `business_connection_id`, `message_thread_id`, `direct_messages_topic_id`,
 * `allow_paid_broadcast`, `suggested_post_parameters`.
 */
export function sendRichMessage(
	api: Api,
	chatId: number | string,
	input: InputRichMessage | string,
	extra: Record<string, unknown> = {},
): Promise<Message> {
	return api.call<Message>("sendRichMessage", {
		chat_id: chatId,
		rich_message: toInput(input),
		...extra,
	});
}

/**
 * `sendRichMessageDraft` — a single ephemeral (30s-ttl) push. private chats
 * only. most callers want `RichMessageDraft` (draft.ts) instead, which keeps the
 * ttl alive across a stream and forces a final `sendRichMessage` commit.
 */
export function sendRichMessageDraft(
	api: Api,
	chatId: number,
	draftId: number,
	input: InputRichMessage | string,
	extra: Record<string, unknown> = {},
): Promise<boolean> {
	return api.call<boolean>("sendRichMessageDraft", {
		chat_id: chatId,
		draft_id: draftId,
		rich_message: toInput(input),
		...extra,
	});
}

export interface RichContext {
	/** `ctx.send`-flavored `sendRichMessage`, bound to the current chat. */
	sendRichMessage(
		input: InputRichMessage | string,
		extra?: Record<string, unknown>,
	): Promise<Message>;
	/** open a `RichMessageDraft` streaming session bound to the current chat. */
	richMessageDraft(draftId: number, options?: RichMessageDraftOptions): RichMessageDraft;
}

/** `bot.install(rich())` — adds `ctx.sendRichMessage` / `ctx.richMessageDraft`. */
export function rich(): Plugin<Context, RichContext> {
	return (composer) =>
		composer.decorate<RichContext>({
			sendRichMessage(this: Context, input, extra = {}) {
				const chatId = this.chat?.id;
				if (chatId === undefined) {
					return Promise.reject(new Error("sendRichMessage(): no chat in this update"));
				}

				return sendRichMessage(this.api, chatId, input, extra);
			},
			richMessageDraft(this: Context, draftId, options) {
				const chatId = this.chat?.id;
				if (chatId === undefined) {
					throw new Error("richMessageDraft(): no chat in this update");
				}

				return new RichMessageDraft(this.api, chatId, draftId, options);
			},
		});
}
