import type { Api, Message } from "@yaebal/core";
import type { InputRichMessage } from "@yaebal/types";
import { RichDocument } from "./document.js";
import type { Dialect } from "./node.js";

export interface RichMessageDraftOptions {
	/**
	 * how often to re-push the last draft to keep it alive, in ms. telegram drops
	 * a draft 30s after the last `sendRichMessageDraft` call for its `draft_id`
	 * ("ephemeral … temporary 30-second preview"); this must stay comfortably
	 * under that. defaults to 20_000.
	 */
	keepAliveMs?: number;
	/** called when a background keep-alive push fails (e.g. network blip). */
	onError?: (error: unknown) => void;
	/**
	 * the forum topic to stream/send into. sendRichMessageDraft has no
	 * business_connection_id param (drafts aren't supported in business chats), so only
	 * the thread id carries through the keep-alive pushes; `send()` additionally accepts
	 * `businessConnectionId` for the final, non-ephemeral sendRichMessage call.
	 */
	messageThreadId?: number;
	/** routed into the final `send()` only — see {@link messageThreadId}. */
	businessConnectionId?: string;
}

interface DraftState {
	dialect: Dialect;
	text: string;
	isRtl?: boolean;
	skipEntityDetection?: boolean;
}

type DraftSource = RichDocument | InputRichMessage | string;

function resolve(input: DraftSource, fallbackDialect: Dialect): DraftState {
	if (typeof input === "string") return { dialect: fallbackDialect, text: input };
	if (input instanceof RichDocument) return resolve(input.toInputRichMessage(), fallbackDialect);

	if (input.html !== undefined) {
		return {
			dialect: "html",
			text: input.html,
			isRtl: input.is_rtl,
			skipEntityDetection: input.skip_entity_detection,
		};
	}

	if (input.markdown !== undefined) {
		return {
			dialect: "markdown",
			text: input.markdown,
			isRtl: input.is_rtl,
			skipEntityDetection: input.skip_entity_detection,
		};
	}

	throw new Error("RichMessageDraft: input must have an `html` or `markdown` field");
}

function toInputRichMessage(state: DraftState): InputRichMessage {
	return {
		[state.dialect]: state.text,
		...(state.isRtl !== undefined ? { is_rtl: state.isRtl } : {}),
		...(state.skipEntityDetection !== undefined
			? { skip_entity_detection: state.skipEntityDetection }
			: {}),
	};
}

/**
 * a `sendRichMessageDraft` streaming session — the operationally hard part of the
 * rich-message api. telegram's draft is ephemeral: it vanishes 30s after the last
 * push, and it never turns into a real message on its own (per the schema:
 * "once the output is finalized, you must call sendRichMessage with the complete
 * message to persist it"). this class:
 *
 * - re-pushes the latest draft on a timer so a slow generator (e.g. an LLM
 *   stream) doesn't lose the draft between tokens;
 * - refuses to push after `send()`/`cancel()`, so a stray late call can't
 *   resurrect a closed draft;
 * - requires an explicit `send()` — there is no implicit "last push wins".
 *
 * two ways to grow the draft: `rewrite()` replaces the whole thing (what you want
 * for a token stream, where each chunk is a longer version of the *same* paragraph),
 * `write()` appends to it via plain string concatenation (what you want to tack on
 * a block — a footer, a divider — after content that's already there, without
 * re-supplying it). a push boundary that lands mid-tag with `write()` is on the
 * caller, same tradeoff raw concatenation always has.
 *
 * `send()` finalizes: with no argument it auto-assembles from the accumulated
 * `rewrite()`/`write()` calls, so you don't have to re-render the final content —
 * pass an explicit override when you want the persisted message to differ from the
 * last draft snapshot.
 *
 * @example
 * const draft = ctx.richMessageDraft(1);
 * await draft.rewrite(document([thinking("…")]));
 * for await (const chunk of stream) {
 *   soFar += chunk;
 *   await draft.rewrite(document([paragraph(soFar)]));
 * }
 * await draft.send();
 */
export class RichMessageDraft {
	readonly #api: Api;
	readonly #chatId: number;
	readonly #draftId: number;
	readonly #keepAliveMs: number;
	readonly #onError?: (error: unknown) => void;
	readonly #messageThreadId?: number;
	readonly #businessConnectionId?: string;

	#timer?: ReturnType<typeof setInterval>;
	#state: DraftState | undefined;
	#closed = false;

	constructor(api: Api, chatId: number, draftId: number, options: RichMessageDraftOptions = {}) {
		this.#api = api;
		this.#chatId = chatId;
		this.#draftId = draftId;
		this.#keepAliveMs = options.keepAliveMs ?? 20_000;
		this.#onError = options.onError;
		this.#messageThreadId = options.messageThreadId;
		this.#businessConnectionId = options.businessConnectionId;
	}

	get closed(): boolean {
		return this.#closed;
	}

	/** replace the whole draft with new content. */
	async rewrite(input: DraftSource): Promise<void> {
		this.#assertOpen();

		this.#state = resolve(input, this.#state?.dialect ?? "html");
		await this.#pushCurrent();
		this.#arm();
	}

	/**
	 * append to the current draft (plain string concatenation of the resolved text).
	 * throws if `input`'s dialect doesn't match the draft's, or if nothing has been
	 * written yet — call `rewrite()` first.
	 */
	async write(input: DraftSource): Promise<void> {
		this.#assertOpen();

		if (!this.#state) {
			throw new Error("RichMessageDraft: write() before the first rewrite()");
		}

		const next = resolve(input, this.#state.dialect);
		if (next.dialect !== this.#state.dialect) {
			throw new Error(
				`RichMessageDraft: write() dialect "${next.dialect}" doesn't match the draft's "${this.#state.dialect}"`,
			);
		}

		this.#state = {
			dialect: this.#state.dialect,
			text: this.#state.text + next.text,
			isRtl: next.isRtl ?? this.#state.isRtl,
			skipEntityDetection: next.skipEntityDetection ?? this.#state.skipEntityDetection,
		};
		await this.#pushCurrent();
		this.#arm();
	}

	#pushCurrent(): Promise<boolean> {
		const state = this.#state;
		if (!state) throw new Error("unreachable: #pushCurrent() with no state");

		return this.#push(toInputRichMessage(state));
	}

	#push(input: InputRichMessage): Promise<boolean> {
		return this.#api.call<boolean>("sendRichMessageDraft", {
			chat_id: this.#chatId,
			draft_id: this.#draftId,
			rich_message: input,
			...(this.#messageThreadId === undefined ? {} : { message_thread_id: this.#messageThreadId }),
		});
	}

	#arm(): void {
		clearInterval(this.#timer);

		this.#timer = setInterval(() => {
			if (!this.#state) return;

			this.#push(toInputRichMessage(this.#state)).catch((error: unknown) => this.#onError?.(error));
		}, this.#keepAliveMs);

		this.#timer.unref?.();
	}

	/**
	 * finalize: persist the real message and stop the keep-alive. with no `override`,
	 * auto-assembles from the accumulated `rewrite()`/`write()` calls. always call this
	 * or `cancel()`.
	 */
	async send(override?: DraftSource, extra: Record<string, unknown> = {}): Promise<Message> {
		this.#stop();

		const state =
			override !== undefined ? resolve(override, this.#state?.dialect ?? "html") : this.#state;

		if (!state) {
			throw new Error(
				"RichMessageDraft: send() with nothing written — call rewrite()/write() first or pass an override",
			);
		}

		return this.#api.call<Message>("sendRichMessage", {
			chat_id: this.#chatId,
			rich_message: toInputRichMessage(state),
			...(this.#messageThreadId === undefined ? {} : { message_thread_id: this.#messageThreadId }),
			...(this.#businessConnectionId === undefined
				? {}
				: { business_connection_id: this.#businessConnectionId }),
			...extra,
		});
	}

	/** abandon the draft without persisting anything — it expires within 30s on its own. */
	cancel(): void {
		this.#stop();
	}

	#stop(): void {
		if (this.#closed) return;

		this.#closed = true;
		clearInterval(this.#timer);
	}

	#assertOpen(): void {
		if (this.#closed) {
			throw new Error("RichMessageDraft: rewrite()/write() after send()/cancel()");
		}
	}
}
