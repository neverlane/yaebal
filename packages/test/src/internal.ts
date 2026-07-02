import type { FormatResult, MessageEntity, Update } from "@yaebal/core";

/**
 * the sliver of {@link TestEnv} actors need — kept as a separate interface (rather than a
 * circular import of the class) so `chat-actor.ts`/`user-actor.ts` don't depend on `env.ts`.
 */
export interface ActorHost {
	dispatch(update: Update): Promise<void>;
	nextMessageId(): number;
	now(): number;
	/** did the bot answer `answerPreCheckoutQuery` for `preCheckoutQueryId` with `ok: true`? */
	answeredPreCheckoutQuery(preCheckoutQueryId: string): boolean;
}

/** text an actor method accepts: a plain string, or a `format`/`fmt` result carrying entities. */
export type SendText = string | FormatResult;

function isFormatResult(value: unknown): value is FormatResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"text" in value &&
		"entities" in value &&
		Array.isArray((value as FormatResult).entities)
	);
}

/** resolve a `SendText` into `{ text, entities }`, merging in any `extraEntities`. */
export function resolveSendText(
	text: SendText,
	extraEntities: MessageEntity[] = [],
): { text: string; entities: MessageEntity[] } {
	const resolved = isFormatResult(text) ? text : { text, entities: [] };
	return { text: resolved.text, entities: [...resolved.entities, ...extraEntities] };
}

let fileCounter = 0;

/** a fake `{ file_id, file_unique_id }` pair — good enough for tests, never a real download. */
export function fakeFile(prefix: string): { file_id: string; file_unique_id: string } {
	const n = ++fileCounter;
	return { file_id: `${prefix}_${n}`, file_unique_id: `u${prefix}${n}` };
}
