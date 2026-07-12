import { type Context, type FilterQuery, matchQuery } from "@yaebal/core";
import { ConversationHalt } from "./errors.js";
import { buildForm } from "./form.js";
import type { Conversation, FormApi, MaybePromise, RawWait, WaitOptions } from "./types.js";

/**
 * builds the full {@link Conversation} surface (`waitFor`/`waitUntil`/`form`/`halt`) on top of
 * one engine-supplied primitive ({@link RawWait.wait}) — so `live.ts` and `replay.ts` only need
 * to implement parking/resuming, never the filter-matching or form logic.
 */
export function buildConversation<C extends Context>(raw: RawWait<C>): Conversation<C> {
	const cv = {
		wait: (options?: WaitOptions): Promise<C> => raw.wait(undefined, options?.timeout),

		waitFor: <Q extends FilterQuery>(query: Q, options?: WaitOptions) =>
			raw.wait((ctx) => matchQuery(ctx, query), options?.timeout) as ReturnType<
				Conversation<C>["waitFor"]
			>,

		waitUntil: (predicate: (ctx: C) => MaybePromise<boolean>, options?: WaitOptions): Promise<C> =>
			raw.wait(predicate, options?.timeout),

		external: <T>(fn: () => MaybePromise<T>): Promise<T> => raw.external(fn),

		halt(): never {
			throw new ConversationHalt();
		},

		get ctx(): C {
			return raw.ctx;
		},

		get signal(): AbortSignal {
			return raw.signal;
		},
	} as Conversation<C>;

	(cv as { form: FormApi<C> }).form = buildForm(cv);

	return cv;
}
