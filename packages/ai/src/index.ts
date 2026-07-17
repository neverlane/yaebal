import type { Context, Message, Plugin } from "@yaebal/core";
import { MAX_MESSAGE_LENGTH, splitText } from "@yaebal/split";
import { createRateLimiter, type RateLimiter, type RateSpec } from "./limits.js";
import { type AiMemory, type AiMemoryOptions, createMemory } from "./memory.js";
import {
	type AiMessage,
	type AiModel,
	type AiModelLike,
	type AiReply,
	type AiRequest,
	generateOf,
	resolveModel,
} from "./model.js";
import {
	type AiStreamRenderOptions,
	type AiStreamResult,
	type StreamTarget,
	streamToChat,
	targetOf,
} from "./stream.js";

export {
	AiLimitError,
	createRateLimiter,
	type ParsedRate,
	parseRate,
	type RateLimiter,
	type RateSpec,
} from "./limits.js";
export {
	type AiMemory,
	type AiMemoryKeyResolver,
	type AiMemoryOptions,
	createMemory,
} from "./memory.js";
export {
	AiError,
	type AiMessage,
	type AiModel,
	type AiModelLike,
	AiProviderError,
	type AiReply,
	type AiRequest,
	type AiRole,
	type AiSdkLanguageModel,
	type AiUsage,
	type AnthropicModelOptions,
	aiSdk,
	anthropicModel,
	collectStream,
	customModel,
	type OpenAiCompatibleOptions,
	openaiCompatible,
	resolveModel,
} from "./model.js";
export {
	type AiStreamRenderOptions,
	type AiStreamResult,
	type StreamTarget,
	streamToChat,
	targetOf,
} from "./stream.js";

/** per-call knobs; every field falls back to the plugin-level option. */
export interface AiCallOptions {
	/** override the system prompt for this call. */
	system?: string;
	/** read/write conversation memory for this call. default: whether memory is enabled. */
	memory?: boolean;
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
}

export interface AiReplyOptions extends AiCallOptions {
	/** observe every telegram message as it lands. */
	onPart?: (message: Message) => unknown;
}

export interface AiTypingOptions {
	/** re-send interval, ms — telegram expires an action after ~5s. default 4000. */
	intervalMs?: number;
}

export interface AiLimitOptions {
	/** per-user budget for model calls, e.g. `"20/h"`. */
	perUser?: RateSpec;
	/** limiter partitioning. default: `ctx.from.id`; updates with no sender are not limited. */
	key?: (ctx: Context) => string | number | undefined;
}

export interface AiOptions {
	/** an {@link AiModel} adapter or a vercel ai sdk `LanguageModel` (auto-detected). */
	model: AiModelLike;
	/** system prompt — static or derived per update. */
	system?: string | ((ctx: Context) => string);
	/**
	 * conversation memory. on by default (in-process storage) — pass a `@yaebal/sklad`
	 * adapter to persist it, or `false` to make every call stateless.
	 */
	memory?: boolean | AiMemoryOptions;
	/** per-user rate limits — exhausted calls throw {@link AiLimitError}. */
	limits?: AiLimitOptions;
	/** parse mode for finalized messages (`"MarkdownV2"`, `"HTML"`, …). in-flight ticks stay plain. */
	parseMode?: string;
	/** how streamed replies render: tick interval, draft opt-out, cursor, message budget. */
	streaming?: Pick<AiStreamRenderOptions, "intervalMs" | "drafts" | "cursor" | "maxLength" | "now">;
	/** keep a `typing` chat action alive during non-streamed replies. default on; `false` disables. */
	typing?: boolean | AiTypingOptions;
	temperature?: number;
	maxTokens?: number;
}

/** what `ctx.ai.reply()` resolves to — the full text plus the messages it landed in. */
export interface AiReplyResult extends AiReply {
	messages: Message[];
}

/** the api `ai()` adds to every context. */
export interface AiApi {
	/** the resolved model adapter — handy for logs and direct use. */
	readonly model: AiModel;
	/** run the model and return the text — nothing is sent to the chat. */
	generate(prompt: string | AiMessage[], options?: AiCallOptions): Promise<AiReply>;
	/** raw token stream — for custom rendering. memory is read but not written. */
	stream(prompt: string | AiMessage[], options?: AiCallOptions): AsyncIterable<string>;
	/** generate, then send — long answers split across messages. */
	reply(prompt: string | AiMessage[], options?: AiReplyOptions): Promise<AiReplyResult>;
	/**
	 * generate and stream into the chat as it comes: native draft animation in private
	 * chats ("Thinking…", animated preview), throttled edits with a cursor elsewhere.
	 */
	replyStream(prompt: string | AiMessage[], options?: AiReplyOptions): Promise<AiStreamResult>;
	/** the stored conversation for this update's memory key. */
	history(): Promise<AiMessage[]>;
	/** forget the stored conversation for this update's memory key. */
	reset(): Promise<void>;
}

export interface AiControl {
	ai: AiApi;
}

const promptTurns = (prompt: string | AiMessage[]): AiMessage[] =>
	typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;

/** split + send with parse-mode fallback — what `reply()` uses under the hood. */
async function sendText(
	target: StreamTarget,
	text: string,
	options: {
		parseMode?: string | undefined;
		maxLength?: number;
		onPart?: AiReplyOptions["onPart"];
	},
): Promise<Message[]> {
	const messages: Message[] = [];
	for (const part of splitText(text, options.maxLength ?? MAX_MESSAGE_LENGTH)) {
		const params = { chat_id: target.chatId, text: part.text, ...target.sendRouting() };
		let message: Message;
		try {
			message = await target.call<Message>("sendMessage", {
				...params,
				...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
			});
		} catch (error) {
			if (options.parseMode === undefined) throw error;
			message = await target.call<Message>("sendMessage", params);
		}
		messages.push(message);
		await options.onPart?.(message);
	}
	return messages;
}

/**
 * installs `ctx.ai` — see {@link AiApi}. model calls flow through (optional) per-user
 * limits, conversation memory and the system prompt; replies stream into the chat via
 * telegram's native draft mechanism where available.
 *
 * @example
 * const bot = createBot(token).install(
 *   ai({ model: openaiCompatible({ model: "gpt-4o-mini", apiKey }) }),
 * );
 * bot.on("message:text", (ctx) => ctx.ai.replyStream(ctx.text));
 */
export function ai(options: AiOptions): Plugin<Context, AiControl> {
	const model = resolveModel(options.model);
	const generate = generateOf(model);
	const memory: AiMemory | undefined =
		options.memory === false
			? undefined
			: createMemory(options.memory === true || options.memory === undefined ? {} : options.memory);
	const limiter: RateLimiter | undefined =
		options.limits?.perUser === undefined ? undefined : createRateLimiter(options.limits.perUser);
	const limitKey = options.limits?.key ?? ((ctx: Context) => ctx.from?.id);
	const typingInterval =
		typeof options.typing === "object" ? (options.typing.intervalMs ?? 4000) : 4000;

	return (composer) =>
		composer.derive((ctx) => {
			const takeLimit = (): void => {
				if (limiter === undefined) return;
				const key = limitKey(ctx);
				if (key !== undefined) limiter.take(key);
			};

			const systemOf = (call: AiCallOptions): string | undefined => {
				if (call.system !== undefined) return call.system;
				return typeof options.system === "function" ? options.system(ctx) : options.system;
			};

			const buildRequest = async (
				prompt: string | AiMessage[],
				call: AiCallOptions,
				useMemory: boolean,
			): Promise<AiRequest> => {
				const system = systemOf(call);
				const history = useMemory && memory !== undefined ? await memory.load(ctx) : [];
				return {
					messages: [
						...(system === undefined ? [] : [{ role: "system", content: system } as AiMessage]),
						...history,
						...promptTurns(prompt),
					],
					temperature: call.temperature ?? options.temperature,
					maxTokens: call.maxTokens ?? options.maxTokens,
					signal: call.signal,
				};
			};

			const remember = async (
				prompt: string | AiMessage[],
				answer: string,
				call: AiCallOptions,
				fallback: boolean,
			): Promise<void> => {
				if (memory === undefined || !(call.memory ?? fallback)) return;
				await memory.append(ctx, [
					...promptTurns(prompt).filter((turn) => turn.role !== "system"),
					{ role: "assistant", content: answer },
				]);
			};

			/** keep the "typing…" action alive while `fn` runs — for non-streamed replies. */
			const withTyping = async <T>(fn: () => Promise<T>): Promise<T> => {
				if (options.typing === false || ctx.chat === undefined) return fn();
				const send = (): void => {
					void ctx.api
						.call("sendChatAction", { chat_id: ctx.chat?.id, action: "typing", ...ctx.routing() })
						.catch(() => undefined);
				};
				send();
				const timer = setInterval(send, typingInterval);
				try {
					return await fn();
				} finally {
					clearInterval(timer);
				}
			};

			const api: AiApi = {
				model,
				async generate(prompt, call = {}) {
					takeLimit();
					const reply = await generate(await buildRequest(prompt, call, call.memory ?? false));
					await remember(prompt, reply.text, call, false);
					return reply;
				},
				async *stream(prompt, call = {}) {
					takeLimit();
					yield* model.stream(await buildRequest(prompt, call, call.memory ?? true));
				},
				async reply(prompt, call = {}) {
					takeLimit();
					const target = targetOf(ctx);
					const reply = await withTyping(async () =>
						generate(await buildRequest(prompt, call, call.memory ?? true)),
					);
					const messages = await sendText(target, reply.text, {
						parseMode: options.parseMode,
						maxLength: options.streaming?.maxLength,
						onPart: call.onPart,
					});
					await remember(prompt, reply.text, call, true);
					return { ...reply, messages };
				},
				async replyStream(prompt, call = {}) {
					takeLimit();
					const target = targetOf(ctx);
					// drafts have a native "Thinking…" placeholder; edit mode gets a typing action
					// to cover the silence before the first token lands.
					if (
						!(target.isPrivate && options.streaming?.drafts !== false) &&
						options.typing !== false
					) {
						void ctx.api
							.call("sendChatAction", {
								chat_id: target.chatId,
								action: "typing",
								...ctx.routing(),
							})
							.catch(() => undefined);
					}
					const request = await buildRequest(prompt, call, call.memory ?? true);
					const result = await streamToChat(target, model.stream(request), {
						...options.streaming,
						parseMode: options.parseMode,
						signal: call.signal,
						onPart: call.onPart,
					});
					await remember(prompt, result.text, call, true);
					return result;
				},
				history: () => (memory === undefined ? Promise.resolve([]) : memory.load(ctx)),
				reset: () => (memory === undefined ? Promise.resolve() : memory.clear(ctx)),
			};

			return { ai: api };
		});
}
