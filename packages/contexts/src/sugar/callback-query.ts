import type * as t from "@yaebal/types";
import { CallbackQueryContextBase } from "../generated/callback-query.js";

type AnswerExtra = Omit<t.AnswerCallbackQueryParams, "callback_query_id" | "text">;
type EditExtra = Omit<t.EditMessageTextParams, "chat_id" | "message_id" | "text">;

/**
 * CallbackQueryContext = generated base + hand-written ergonomic overloads.
 * Positional-string sugar for `answer` (the toast you fire on every tap) and
 * `editText` (editing the message the button is attached to).
 */
export class CallbackQueryContext extends CallbackQueryContextBase {
	/** Id of the chat the button's message is in (if still accessible). */
	get chatId(): number | undefined {
		return this.message?.chat?.id;
	}

	/** Answer the callback query. Pass a string to flash text to the user. */
	override answer(text: string, params?: AnswerExtra): Promise<boolean>;
	override answer(
		params?: Omit<t.AnswerCallbackQueryParams, "callback_query_id">,
	): Promise<boolean>;
	override answer(
		a?: string | Omit<t.AnswerCallbackQueryParams, "callback_query_id">,
		b?: AnswerExtra,
	): Promise<boolean> {
		return super.answer(typeof a === "string" ? { text: a, ...b } : (a ?? {}));
	}

	/** Edit the attached message's text. Pass a string for the common case. */
	override editText(text: string, params?: EditExtra): Promise<t.Message | boolean>;
	override editText(
		params: Omit<t.EditMessageTextParams, "chat_id" | "message_id">,
	): Promise<t.Message | boolean>;
	override editText(
		a: string | Omit<t.EditMessageTextParams, "chat_id" | "message_id">,
		b?: EditExtra,
	): Promise<t.Message | boolean> {
		return super.editText(typeof a === "string" ? { text: a, ...b } : a);
	}
}
