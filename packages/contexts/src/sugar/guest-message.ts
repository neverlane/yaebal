import type * as t from "@yaebal/types";
import { GuestMessageContextBase } from "../generated/guest-message.js";

/**
 * GuestMessageContext = generated base + hand-written ergonomic overloads.
 * positional sugar for `answer` — pass the result directly. publishes it as a
 * real message in the chat where the guest bot was summoned (unlike inline
 * mode, there's no popup — this is the only way to respond).
 */
export class GuestMessageContext extends GuestMessageContextBase {
	override answer(result: t.InlineQueryResult): Promise<t.SentGuestMessage>;
	override answer(
		params: Omit<t.AnswerGuestQueryParams, "guest_query_id">,
	): Promise<t.SentGuestMessage>;
	override answer(
		a: t.InlineQueryResult | Omit<t.AnswerGuestQueryParams, "guest_query_id">,
	): Promise<t.SentGuestMessage> {
		return super.answer("type" in a ? { result: a } : a);
	}
}
