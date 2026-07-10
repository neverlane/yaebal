import type { FormatResult, Message } from "@yaebal/core";
import { InlineKeyboard, type InlineKeyboardMarkup } from "@yaebal/keyboard";
import { isNotModified, MAX_CAPTION, MAX_TEXT, MordaError } from "./internal.js";
import type { CallbackButton, DialogState, WindowView } from "./types.js";

/** the slice of `Api` delivery needs — kept structural so tests can fake it. */
export interface ApiLike {
	call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

/** pack a window's callback buttons into wire data. injected by the engine. */
export type PackButton = (windowId: string, buttonId: string) => string;

const SEND_METHOD = {
	photo: "sendPhoto",
	video: "sendVideo",
	animation: "sendAnimation",
	document: "sendDocument",
	audio: "sendAudio",
} as const;

function resolveText(text: string | FormatResult): {
	text: string;
	entities?: FormatResult["entities"];
} {
	if (typeof text === "string") return { text };
	return { text: text.text, entities: text.entities };
}

function isCallback(b: object): b is CallbackButton {
	return "id" in b;
}

/** build the markup, failing loud on the mistakes telegram would reject silently later. */
export function renderKeyboard(
	windowId: string,
	view: WindowView,
	pack: PackButton,
): InlineKeyboardMarkup | undefined {
	const rows = view.keyboard ?? [];
	if (rows.every((row) => row.length === 0)) return undefined;

	const kb = new InlineKeyboard();
	const seen = new Set<string>();

	for (const row of rows) {
		for (const b of row) {
			if (!b.label) {
				throw new MordaError(`window "${windowId}": a button has an empty label`);
			}
			if (isCallback(b)) {
				if (!b.id) throw new MordaError(`window "${windowId}": a button has an empty id`);
				if (seen.has(b.id)) {
					throw new MordaError(`window "${windowId}": duplicate button id "${b.id}"`);
				}
				seen.add(b.id);
				try {
					kb.text(b.label, pack(windowId, b.id));
				} catch (error) {
					throw new MordaError(
						`window "${windowId}": button id "${b.id}" does not fit the 64-byte ` +
							`callback_data budget — use a shorter id (${(error as Error).message})`,
					);
				}
			} else if ("url" in b) {
				kb.url(b.label, b.url);
			} else if ("webApp" in b) {
				kb.webApp(b.label, b.webApp);
			} else if ("copy" in b) {
				kb.copyText(b.label, b.copy);
			} else if (b.currentChat) {
				kb.switchInlineCurrentChat(b.label, b.switchInline);
			} else {
				kb.switchInline(b.label, b.switchInline);
			}
			if (b.style) kb.style(b.style);
			if (b.icon) kb.icon(b.icon);
		}
		kb.row();
	}
	return kb.build();
}

function businessParams(st: DialogState): Record<string, unknown> {
	const id = st.businessConnectionId;
	return id === undefined ? {} : { business_connection_id: id };
}

function previewParams(view: WindowView): Record<string, unknown> {
	if (view.linkPreview === undefined) return {};
	return { link_preview_options: { is_disabled: !view.linkPreview } };
}

/** stable signature of a rendered view — equal signature ⇒ the edit would be a no-op. */
function signature(
	text: string,
	entities: unknown,
	markup: InlineKeyboardMarkup | undefined,
	view: WindowView,
): string {
	const media = view.media
		? `${view.media.type}:${typeof view.media.media === "string" ? view.media.media : "~upload"}`
		: "";
	return JSON.stringify([text, entities ?? null, markup ?? null, media]);
}

/**
 * put a rendered view on screen. edits in place when possible; falls back to
 * delete + resend when the message is gone, was media and is now text (or vice
 * versa), or telegram refuses the edit. a render identical to the last delivered
 * one is skipped entirely. mutates `st` (messageId / hasMedia / last).
 */
export async function deliverView(
	api: ApiLike,
	st: DialogState,
	windowId: string,
	view: WindowView,
	pack: PackButton,
	forceSend = false,
): Promise<void> {
	const { text, entities } = resolveText(view.text);
	const limit = view.media ? MAX_CAPTION : MAX_TEXT;
	if (text.length > limit) {
		throw new MordaError(
			`window "${windowId}": text is ${text.length} chars — telegram caps ${
				view.media ? "captions at 1024" : "messages at 4096"
			}`,
		);
	}

	const markup = renderKeyboard(windowId, view, pack);
	const sig = signature(text, entities, markup, view);
	const canEdit = !forceSend && st.messageId !== 0;

	if (canEdit && sig === st.last) return; // nothing changed — skip the round-trip

	if (canEdit && !!view.media === st.hasMedia) {
		try {
			if (view.media) {
				await api.call("editMessageMedia", {
					chat_id: st.chatId,
					message_id: st.messageId,
					media: {
						type: view.media.type,
						media: view.media.media,
						...(text ? { caption: text, caption_entities: entities } : {}),
					},
					reply_markup: markup,
					...businessParams(st),
				});
			} else {
				await api.call("editMessageText", {
					chat_id: st.chatId,
					message_id: st.messageId,
					text,
					entities,
					reply_markup: markup,
					...previewParams(view),
					...businessParams(st),
				});
			}
			st.last = sig;
			return;
		} catch (error) {
			if (isNotModified(error)) {
				st.last = sig;
				return;
			}
			// the message was deleted, is too old, or otherwise refuses the edit —
			// fall through to a fresh send so the dialog never bricks.
		}
	}

	if (st.messageId !== 0) await removeMessage(api, st);

	const sent = view.media
		? await api.call<Message>(SEND_METHOD[view.media.type], {
				chat_id: st.chatId,
				[view.media.type]: view.media.media,
				...(text ? { caption: text, caption_entities: entities } : {}),
				reply_markup: markup,
				...businessParams(st),
			})
		: await api.call<Message>("sendMessage", {
				chat_id: st.chatId,
				text,
				entities,
				reply_markup: markup,
				...previewParams(view),
				...businessParams(st),
			});

	st.messageId = sent.message_id;
	st.hasMedia = !!view.media;
	st.last = sig;
}

/**
 * remove the dialog message. deletion can legitimately fail (older than 48h,
 * already deleted by the user) — then fall back to disarming the keyboard so no
 * dead buttons stay behind. never throws: closing a dialog must always succeed.
 */
export async function removeMessage(api: ApiLike, st: DialogState): Promise<void> {
	if (st.messageId === 0) return;
	try {
		if (st.businessConnectionId === undefined) {
			await api.call("deleteMessage", { chat_id: st.chatId, message_id: st.messageId });
		} else {
			// deleteMessage can't touch business chats — route via deleteBusinessMessages.
			await api.call("deleteBusinessMessages", {
				business_connection_id: st.businessConnectionId,
				message_ids: [st.messageId],
			});
		}
	} catch {
		await api
			.call("editMessageReplyMarkup", {
				chat_id: st.chatId,
				message_id: st.messageId,
				...businessParams(st),
			})
			.catch(() => {});
	}
}
