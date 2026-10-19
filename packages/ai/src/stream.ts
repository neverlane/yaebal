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

/** shared only by the runtime plugin and renderer. */
export const GENERATION_STOPPED = Symbol("ai.generationStopped");

/** which rich-message dialect model output is sent as. markdown is what models write natively. */
export type AiRichDialect = "markdown" | "html";

/** telegram's rich message text limit (bot api: up to 32768 characters). */
export const MAX_RICH_LENGTH = 32_768;

const richDialectOf = (rich: boolean | AiRichDialect | undefined): AiRichDialect | undefined =>
	rich === true ? "markdown" : rich === false ? undefined : rich;

const isMessage = (value: unknown): value is Message =>
	typeof value === "object" && value !== null && "message_id" in value;

/** a 400 — what telegram answers markup it can't parse with, in either text mode. */
function isBadRequest(error: unknown): boolean {
	return error instanceof TelegramError && error.code === 400;
}

export interface DeliverOptions {
	/** send as a rich message in this dialect (or markdown for `true`). wins over `parseMode`. */
	rich?: boolean | AiRichDialect | undefined;
	parseMode?: string | undefined;
	onPart?: ((message: Message) => unknown) | undefined;
}

/**
 * send one finished piece of model output as a new message. rich output that telegram
 * rejects (a 400) is resent as plain text — split to the plain limit — so an answer is never
 * lost to a markup mistake; same for a `parseMode` that fails to parse.
 */
export async function deliver(
	target: StreamTarget,
	text: string,
	options: DeliverOptions = {},
): Promise<Message[]> {
	if (text.length === 0) return [];
	const dialect = richDialectOf(options.rich);
	const out: Message[] = [];
	const land = async (message: Message): Promise<void> => {
		out.push(message);
		await options.onPart?.(message);
	};

	if (dialect !== undefined) {
		try {
			await land(
				await target.call<Message>("sendRichMessage", {
					chat_id: target.chatId,
					rich_message: { [dialect]: text },
					...target.sendRouting(),
				}),
			);
			return out;
		} catch (error) {
			if (!isBadRequest(error)) throw error;
		}
		for (const part of splitText(text, MAX_MESSAGE_LENGTH)) {
			await land(await sendPlain(target, part.text, undefined));
		}
		return out;
	}

	await land(await sendPlain(target, text, options.parseMode));
	return out;
}

async function sendPlain(
	target: StreamTarget,
	text: string,
	parseMode: string | undefined,
): Promise<Message> {
	const params = { chat_id: target.chatId, text, ...target.sendRouting() };
	try {
		return await target.call<Message>("sendMessage", {
			...params,
			...(parseMode === undefined ? {} : { parse_mode: parseMode }),
		});
	} catch (error) {
		if (parseMode === undefined || !isParseError(error)) throw error;
		return target.call<Message>("sendMessage", params);
	}
}

export interface AiStreamRenderOptions {
	/** applied at finalization only — in-flight ticks are always plain text. ignored with `rich`. */
	parseMode?: string;
	/**
	 * stream into a telegram rich message instead of plain text — rendered markdown (headings,
	 * lists, code, tables, math) live while the model writes, and a 32768-character budget per
	 * message instead of 4096. `true` = markdown. drafts use `sendRichMessageDraft`, finals
	 * `sendRichMessage`; markup telegram rejects is resent as plain text instead of lost.
	 */
	rich?: boolean | AiRichDialect;
	/** label of the native `<tg-thinking>` placeholder a rich draft opens with. default `"Thinking…"`. */
	thinking?: string;
	/** minimum gap between telegram calls while streaming, ms. default 500 (draft) / 1200 (edit). */
	intervalMs?: number;
	/** use `sendMessageDraft` in private chats (native "Thinking…" + animation). default true. */
	drafts?: boolean;
	/** show telegram's native stop button in private drafts. default false. */
	canStop?: boolean;
	/** persist the partial response after a native stop. default false. */
	keepOnStop?: boolean;
	/** observe the current draft id (also changes on message splitting). */
	onDraft?: (draftId: number) => void;
	/** appended to in-flight edit ticks so the message visibly streams. default `"▍"`, `""` disables. */
	cursor?: string;
	/** per-message length budget. default telegram's 4096 (32768 with `rich`). */
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
	/** true when telegram's native stop button cancelled this stream. */
	stopped: boolean;
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
	const dialect = richDialectOf(options.rich);
	const maxLength =
		options.maxLength ?? (dialect === undefined ? MAX_MESSAGE_LENGTH : MAX_RICH_LENGTH);
	/** the content params of one call: plain `text`, or a `rich_message` in the chosen dialect. */
	const body = (text: string): Record<string, unknown> =>
		dialect === undefined ? { text } : { rich_message: { [dialect]: text } };
	const now = options.now ?? Date.now;

	const messages: Message[] = [];
	let full = "";
	let buffer = "";
	let ticks = 0;
	let aborted = false;
	const stopParams = {
		...(options.canStop === undefined ? {} : { can_stop: options.canStop }),
		...(options.keepOnStop === undefined ? {} : { keep_on_stop: options.keepOnStop }),
	};

	// draft state
	let draftId = nextDraftId();
	// edit state
	let editMessageId: number | undefined;
	/** the preview message being grown by edits — it *is* the final message once finalized. */
	let editMessage: Message | undefined;
	let lastPreview = "";

	let lastFlush = -Infinity;

	const land = async (message: Message): Promise<void> => {
		messages.push(message);
		await options.onPart?.(message);
	};

	const sendFinal = async (text: string): Promise<void> => {
		messages.push(
			...(await deliver(target, text, {
				rich: dialect,
				parseMode: options.parseMode,
				onPart: options.onPart,
			})),
		);
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
		// editMessageText answers with the edited message — that's the finalized part
		let final: unknown = editMessage;
		if (text.length > 0 && text !== lastPreview) {
			const { text: _plain, ...address } = params;
			if (dialect !== undefined) {
				try {
					final = await target.call("editMessageText", { ...address, ...body(text) });
				} catch (error) {
					if (!isBadRequest(error)) throw error;
					// rich markup rejected: keep the answer as plain text, split to the plain limit
					const [first, ...rest] = splitText(text, MAX_MESSAGE_LENGTH);
					if (first !== undefined)
						final = await target.call("editMessageText", { ...address, text: first.text });
					await land(isMessage(final) ? final : (editMessage as Message));
					final = undefined;
					editMessage = undefined;
					for (const part of rest) await land(await sendPlain(target, part.text, undefined));
				}
			} else {
				try {
					final = await target.call("editMessageText", {
						...params,
						...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
					});
				} catch (error) {
					if (!isParseError(error)) throw error;
					final = await target.call("editMessageText", params);
				}
			}
		}
		// an edit answering `true` (no message object) still finalized the preview message
		const finished = isMessage(final) ? final : editMessage;
		if (finished !== undefined) await land(finished);
		editMessage = undefined;
		editMessageId = undefined;
		lastPreview = "";
	};

	/** flush the in-flight preview (throttled; best-effort — a failed tick just waits for the next). */
	const preview = async (): Promise<void> => {
		if (options.signal?.aborted || buffer.length === 0 || now() - lastFlush < intervalMs) return;
		lastFlush = now();
		ticks += 1;

		try {
			if (mode === "draft") {
				await target.call(dialect === undefined ? "sendMessageDraft" : "sendRichMessageDraft", {
					chat_id: target.chatId,
					draft_id: draftId,
					...stopParams,
					...body(buffer),
					...(target.threadId === undefined ? {} : { message_thread_id: target.threadId }),
				});
				return;
			}

			const text = cursor.length > 0 ? buffer + cursor : buffer;
			if (text === lastPreview) return;
			if (editMessageId === undefined) {
				const message = await target.call<Message>(
					dialect === undefined ? "sendMessage" : "sendRichMessage",
					{ chat_id: target.chatId, ...body(text), ...target.sendRouting() },
				);
				editMessageId = message.message_id;
				editMessage = message;
			} else {
				await target.call("editMessageText", {
					chat_id: target.chatId,
					message_id: editMessageId,
					...body(text),
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
	const overflow = async (finalizing = false): Promise<void> => {
		while (buffer.length > maxLength && (finalizing || !options.signal?.aborted)) {
			const head = splitText(buffer, maxLength)[0];
			if (head === undefined || head.text.length === 0) return;

			if (mode === "draft") {
				await sendFinal(head.text);
				draftId = nextDraftId();
				options.onDraft?.(draftId);
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

	if (mode === "draft" && !options.signal?.aborted) {
		options.onDraft?.(draftId);
		// empty draft = telegram's native "Thinking…" placeholder, shown before the first token;
		// rich drafts have no empty form, they spell it with the `<tg-thinking>` tag instead.
		try {
			await target.call(dialect === undefined ? "sendMessageDraft" : "sendRichMessageDraft", {
				chat_id: target.chatId,
				draft_id: draftId,
				...stopParams,
				...(dialect === undefined
					? { text: "" }
					: body(`<tg-thinking>${options.thinking ?? "Thinking…"}</tg-thinking>`)),
				...(target.threadId === undefined ? {} : { message_thread_id: target.threadId }),
			});
		} catch {
			// cosmetic — a bot api older than the schema, or a race; streaming still works.
		}
	}

	// race an idle provider against cancellation; custom models may ignore the signal.
	// do not await iterator.return() after abort: an async generator can still be waiting
	// in next(). the provider shares the signal and closes its network stream separately.
	const iterator = source[Symbol.asyncIterator]();
	const interrupted = Symbol("interrupted");
	let interrupt!: () => void;
	const cancellation = new Promise<typeof interrupted>((resolve) => {
		interrupt = () => resolve(interrupted);
	});
	options.signal?.addEventListener("abort", interrupt, { once: true });
	try {
		while (!options.signal?.aborted) {
			const item = await Promise.race([iterator.next(), cancellation]);
			if (item === interrupted || item.done || options.signal?.aborted) break;
			const piece = item.value;
			if (piece.length === 0) continue;
			full += piece;
			buffer += piece;
			await overflow();
			await preview();
		}
	} catch (error) {
		if (!options.signal?.aborted) throw error;
	} finally {
		options.signal?.removeEventListener("abort", interrupt);
		if (options.signal?.aborted) {
			void Promise.resolve()
				.then(() => iterator.return?.())
				.catch(() => undefined);
		} else {
			await iterator.return?.();
		}
	}
	aborted = options.signal?.aborted ?? false;
	const stopped = aborted && options.signal?.reason === GENERATION_STOPPED;
	if (!stopped || options.keepOnStop === true) {
		await overflow(true);
		if (mode === "draft") await sendFinal(buffer);
		else await finalizeEdit(buffer);
	}
	return { text: full, messages, mode, ticks, aborted, stopped };
}
