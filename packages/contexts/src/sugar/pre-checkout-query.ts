import type * as t from "@yaebal/types";
import { PreCheckoutQueryContextBase } from "../generated/pre-checkout-query.js";

type Extra = Omit<t.AnswerPreCheckoutQueryParams, "pre_checkout_query_id" | "ok">;

/** PreCheckoutQueryContext = generated base + a positional `answer(ok)`. */
export class PreCheckoutQueryContext extends PreCheckoutQueryContextBase {
	/** Answer the pre-checkout query. Pass `true` to approve, `false` (+ error_message) to reject. */
	override answer(ok: boolean, params?: Extra): Promise<boolean>;
	override answer(
		params: Omit<t.AnswerPreCheckoutQueryParams, "pre_checkout_query_id">,
	): Promise<boolean>;
	override answer(
		a: boolean | Omit<t.AnswerPreCheckoutQueryParams, "pre_checkout_query_id">,
		b?: Extra,
	): Promise<boolean> {
		return super.answer(typeof a === "boolean" ? { ok: a, ...b } : a);
	}
}
