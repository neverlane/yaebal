import type * as t from "@yaebal/types";
import { ShippingQueryContextBase } from "../generated/shipping-query.js";

type Extra = Omit<t.AnswerShippingQueryParams, "shipping_query_id" | "ok">;

/** ShippingQueryContext = generated base + a positional `answer(ok)`. */
export class ShippingQueryContext extends ShippingQueryContextBase {
	/** Answer the shipping query. Pass `true`/`false` for the common case. */
	override answer(ok: boolean, params?: Extra): Promise<boolean>;
	override answer(params: Omit<t.AnswerShippingQueryParams, "shipping_query_id">): Promise<boolean>;
	override answer(
		a: boolean | Omit<t.AnswerShippingQueryParams, "shipping_query_id">,
		b?: Extra,
	): Promise<boolean> {
		return super.answer(typeof a === "boolean" ? { ok: a, ...b } : a);
	}
}
