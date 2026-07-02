import type { Api, Message } from "@yaebal/core";
import type { InputRichMessage } from "@yaebal/types";

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
 * - refuses to push after `commit()`/`cancel()`, so a stray late token can't
 *   resurrect a closed draft;
 * - requires an explicit `commit()` — there is no implicit "last push wins".
 *
 * @example
 * const draft = ctx.richMessageDraft(1);
 * await draft.push(thinking("…"));
 * for await (const chunk of stream) await draft.push(document([paragraph(soFar)]));
 * await draft.commit(document([paragraph(finalAnswer)]));
 */
export class RichMessageDraft {
	readonly #api: Api;
	readonly #chatId: number;
	readonly #draftId: number;
	readonly #keepAliveMs: number;
	readonly #onError?: (error: unknown) => void;

	#timer?: ReturnType<typeof setInterval>;
	#latest: InputRichMessage | undefined;
	#closed = false;

	constructor(api: Api, chatId: number, draftId: number, options: RichMessageDraftOptions = {}) {
		this.#api = api;
		this.#chatId = chatId;
		this.#draftId = draftId;
		this.#keepAliveMs = options.keepAliveMs ?? 20_000;
		this.#onError = options.onError;
	}

	get closed(): boolean {
		return this.#closed;
	}

	/** push a new partial draft; telegram animates the transition for a shared `draft_id`. */
	async push(input: InputRichMessage | string): Promise<void> {
		if (this.#closed) throw new Error("RichMessageDraft: push() after commit()/cancel()");

		const resolved = typeof input === "string" ? { html: input } : input;

		this.#latest = resolved;
		await this.#push(resolved);
		this.#arm();
	}

	#push(input: InputRichMessage): Promise<boolean> {
		return this.#api.call<boolean>("sendRichMessageDraft", {
			chat_id: this.#chatId,
			draft_id: this.#draftId,
			rich_message: input,
		});
	}

	#arm(): void {
		clearInterval(this.#timer);

		this.#timer = setInterval(() => {
			if (!this.#latest) return;

			this.#push(this.#latest).catch((error: unknown) => this.#onError?.(error));
		}, this.#keepAliveMs);

		this.#timer.unref?.();
	}

	/** finalize: persist the real message and stop the keep-alive. always call this or `cancel()`. */
	async commit(
		input: InputRichMessage | string,
		extra: Record<string, unknown> = {},
	): Promise<Message> {
		this.#stop();

		const resolved = typeof input === "string" ? { html: input } : input;

		return this.#api.call<Message>("sendRichMessage", {
			chat_id: this.#chatId,
			rich_message: resolved,
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
}
