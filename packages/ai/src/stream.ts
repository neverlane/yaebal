import { type Context, type Message, TelegramError } from "@yaebal/core";
import { MAX_MESSAGE_LENGTH, splitText } from "@yaebal/split";

/**
 * the api surface the streaming engine needs — a narrow slice of `Context`, so the pure
 * engine is testable without a full bot. build one from a context with {@link targetOf}.
 */
export interface StreamTarget {
	chatId: number | string;
	/** drafts are a private-chat-only telegram feature. */
	isPrivate: boolean;
	threadId?: number | undefined;
	call<T>(method: string, params: Record<string, unknown>): Promise<T>;
	/** routing params for NEW messages (business connection + forum topic). */
	sendRouting(): Record<string, unknown>;
	/** routing params for edits (business connection only — edits reject topic ids). */
	editRouting(): Record<string, unknown>;
}

/** build a {@link StreamTarget} from a live update context. throws when there's no chat. */
export function targetOf(ctx: Context): StreamTarget {
	const chat = ctx.chat;
	if (chat === undefined) throw new Error("ai: no chat in this update to stream into");

	return {
		chatId: chat.id,
		isPrivate: chat.type === "private",
		threadId: ctx.messageThreadId,
		call: (method, params) => ctx.api.call(method, params),
		sendRouting: () => ctx.routing(),
		editRouting: () => ctx.businessRouting(),
	};
}

export interface AiStreamRenderOptions {
	/** applied at finalization only — in-flight ticks are always plain text. */
	parseMode?: string;
	/** minimum gap between telegram calls while streaming, ms. default 500 (draft) / 1200 (edit). */
	intervalMs?: number;
	/** use `sendMessageDraft` in private chats (native "Thinking…" + animation). default true. */
	drafts?: boolean;
	/** appended to in-flight edit ticks so the message visibly streams. default `"▍"`, `""` disables. */
	cursor?: string;
	/** per-message length budget. default telegram's 4096. */
	maxLength?: number;
	/** abort the render loop (the model stream should share this signal). */
	signal?: AbortSignal;
	/** observe every finalized telegram message as it lands. */
	onPart?: (message: Message) => unknown;
	/** clock used for throttling — injectable for tests. default `Date.now`. */
	now?: () => number;
}

export interface AiStreamResult {
	/** the full model output. */
	text: string;
	/** every real (persisted) telegram message that was sent. */
	messages: Message[];
	/** how the stream was rendered: draft animation or edit-throttling. */
	mode: "draft" | "edit";
	/** number of in-flight preview updates (draft ticks or message edits). */
	ticks: number;
	/** true when `signal` aborted mid-stream — `text`/`messages` hold what was rendered. */
	aborted: boolean;
}

const DRAFT_INTERVAL_MS = 500;
const EDIT_INTERVAL_MS = 1200;

/** telegram rejects entity soups it can't parse with a 400 — that's our cue to resend plain. */
function isParseError(error: unknown): boolean {
	return (
		error instanceof TelegramError &&
		error.code === 400 &&
		error.description.toLowerCase().includes("parse")
	);
}

let draftSeed = (Math.floor(Math.random() * 0x7fff0000) | 1) >>> 0;
/** non-zero draft ids; fresh per finalized part so old text never animates into new. */
function nextDraftId(): number {
	draftSeed = (draftSeed + 1) >>> 0;
	return draftSeed === 0 ? ++draftSeed : draftSeed;
}

/**
 * render a text stream into a chat. picks the best mechanism available:
 *
 * - **private chats** — `sendMessageDraft`: telegram's native streaming preview ("Thinking…"
 *   placeholder, animated draft), finalized into a real message via `sendMessage`.
 * - **groups / channels** — a message that grows by throttled `editMessageText` calls,
 *   with a typing cursor while in flight.
 *
 * output longer than `maxLength` is split at word boundaries (via `@yaebal/split`) and
 * finalized message-by-message while the stream keeps going. `parseMode` is applied only
 * to finalized messages — if telegram can't parse the finished text, it's resent plain
 * rather than lost.
 */
export async function streamToChat(
	target: StreamTarget,
	source: AsyncIterable<string>,
	options: AiStreamRenderOptions = {},
): Promise<AiStreamResult> {
	const mode: "draft" | "edit" = target.isPrivate && options.drafts !== false ? "draft" : "edit";
	const intervalMs =
		options.intervalMs ?? (mode === "draft" ? DRAFT_INTERVAL_MS : EDIT_INTERVAL_MS);
	const cursor = options.cursor ?? "▍";
	const maxLength = options.maxLength ?? MAX_MESSAGE_LENGTH;
	const now = options.now ?? Date.now;

	const messages: Message[] = [];
	let full = "";
	let buffer = "";
	let ticks = 0;
	let aborted = false;

	// draft state
	let draftId = nextDraftId();
	// edit state
	let editMessageId: number | undefined;
	let lastPreview = "";

	let lastFlush = -Infinity;

	const sendFinal = async (text: string): Promise<void> => {
		if (text.length === 0) return;
		const params = {
			chat_id: target.chatId,
			text,
			...target.sendRouting(),
		};
		let message: Message;
		try {
			message = await target.call<Message>("sendMessage", {
				...params,
				...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
			});
		} catch (error) {
			if (!isParseError(error)) throw error;
			message = await target.call<Message>("sendMessage", params);
		}
		messages.push(message);
		await options.onPart?.(message);
	};

	const finalizeEdit = async (text: string): Promise<void> => {
		if (editMessageId === undefined) {
			await sendFinal(text);
			return;
		}
		const params = {
			chat_id: target.chatId,
			message_id: editMessageId,
			text,
			...target.editRouting(),
		};
		if (text.length > 0 && text !== lastPreview) {
			try {
				await target.call("editMessageText", {
					...params,
					...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
				});
			} catch (error) {
				if (!isParseError(error)) throw error;
				await target.call("editMessageText", params);
			}
		}
		editMessageId = undefined;
		lastPreview = "";
	};

	/** flush the in-flight preview (throttled; best-effort — a failed tick just waits for the next). */
	const preview = async (): Promise<void> => {
		if (buffer.length === 0 || now() - lastFlush < intervalMs) return;
		lastFlush = now();
		ticks += 1;

		try {
			if (mode === "draft") {
				await target.call("sendMessageDraft", {
					chat_id: target.chatId,
					draft_id: draftId,
					text: buffer,
					...(target.threadId === undefined ? {} : { message_thread_id: target.threadId }),
				});
				return;
			}

			const text = cursor.length > 0 ? buffer + cursor : buffer;
			if (text === lastPreview) return;
			if (editMessageId === undefined) {
				const message = await target.call<Message>("sendMessage", {
					chat_id: target.chatId,
					text,
					...target.sendRouting(),
				});
				editMessageId = message.message_id;
			} else {
				await target.call("editMessageText", {
					chat_id: target.chatId,
					message_id: editMessageId,
					text,
					...target.editRouting(),
				});
			}
			lastPreview = text;
		} catch {
			// preview ticks are cosmetic — flood limits or races here must never kill the stream.
			ticks -= 1;
		}
	};

	/** finalize every full-size head part, keep the raw tail (boundary whitespace intact) streaming. */
	const overflow = async (): Promise<void> => {
		while (buffer.length > maxLength) {
			const head = splitText(buffer, maxLength)[0];
			if (head === undefined || head.text.length === 0) return;

			if (mode === "draft") {
				await sendFinal(head.text);
				draftId = nextDraftId();
			} else {
				await finalizeEdit(head.text);
			}

			// the head is a (whitespace-trimmed) prefix of the buffer: consume it plus the cut
			// boundary, but keep the rest byte-exact so the next chunk never glues to the tail.
			let rest = head.text.length;
			while (rest < buffer.length && " \t\n\r".includes(buffer.charAt(rest))) rest += 1;
			buffer = buffer.slice(rest);
			lastFlush = -Infinity; // the new part deserves an immediate preview
		}
	};

	if (mode === "draft") {
		// empty draft = telegram's native "Thinking…" placeholder, shown before the first token.
		try {
			await target.call("sendMessageDraft", {
				chat_id: target.chatId,
				draft_id: draftId,
				text: "",
				...(target.threadId === undefined ? {} : { message_thread_id: target.threadId }),
			});
		} catch {
			// cosmetic — a bot api older than the schema, or a race; streaming still works.
		}
	}

	for await (const piece of source) {
		if (options.signal?.aborted === true) {
			aborted = true;
			break;
		}
		if (piece.length === 0) continue;
		full += piece;
		buffer += piece;
		await overflow();
		await preview();
	}

	// finalization: whatever is left becomes real message(s).
	await overflow();
	if (mode === "draft") {
		await sendFinal(buffer);
	} else {
		await finalizeEdit(buffer);
	}

	return { text: full, messages, mode, ticks, aborted };
}
