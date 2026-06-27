import type * as t from "@yaebal/types";
import { InlineQueryContextBase } from "../generated/inline-query.js";

type AnswerExtra = Omit<t.AnswerInlineQueryParams, "inline_query_id" | "results">;

/**
 * InlineQueryContext = generated base + hand-written ergonomic overloads.
 * Positional sugar for `answer` — pass the results array directly.
 */
export class InlineQueryContext extends InlineQueryContextBase {
	/** Answer the inline query with a list of results. */
	override answer(results: t.InlineQueryResult[], params?: AnswerExtra): Promise<boolean>;
	override answer(params: Omit<t.AnswerInlineQueryParams, "inline_query_id">): Promise<boolean>;
	override answer(
		a: t.InlineQueryResult[] | Omit<t.AnswerInlineQueryParams, "inline_query_id">,
		b?: AnswerExtra,
	): Promise<boolean> {
		return super.answer(Array.isArray(a) ? { results: a, ...b } : a);
	}
}
