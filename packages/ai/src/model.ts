import { sseData } from "./sse.js";

/** a chat turn as every adapter understands it. */
export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
	role: AiRole;
	content: string;
}

export interface AiUsage {
	inputTokens?: number;
	outputTokens?: number;
}

/** one completion request — what `AiModel` implementations receive. */
export interface AiRequest {
	messages: AiMessage[];
	signal?: AbortSignal;
	temperature?: number;
	maxTokens?: number;
}

/** a finished (non-streamed) completion. */
export interface AiReply {
	text: string;
	usage?: AiUsage;
}

/**
 * the provider contract. `stream()` is the only required method — `generate()` falls back
 * to collecting the stream. implement it directly for exotic sources, or use the built-in
 * adapters: {@link openaiCompatible}, {@link anthropicModel}, {@link aiSdk},
 * {@link customModel}.
 */
export interface AiModel {
	/** human-readable id for logs and errors, e.g. `"openai:gpt-4o-mini"`. */
	readonly id: string;
	stream(request: AiRequest): AsyncIterable<string>;
	generate?(request: AiRequest): Promise<AiReply>;
}

/** every failure mode of this plugin throws this (or a subclass). */
export class AiError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "AiError";
	}
}

/** thrown when a provider http request fails. carries the status and response body. */
export class AiProviderError extends AiError {
	readonly status: number;
	readonly body: string;

	constructor(model: string, status: number, body: string) {
		super(`ai: ${model} request failed with ${status}: ${body.slice(0, 300)}`);
		this.name = "AiProviderError";
		this.status = status;
		this.body = body;
	}
}

/** collect a model's stream into a full reply — the `generate()` fallback. */
export async function collectStream(model: AiModel, request: AiRequest): Promise<AiReply> {
	let text = "";
	for await (const piece of model.stream(request)) text += piece;
	return { text };
}

/** resolve `generate` whether the model implements it or only streams. */
export function generateOf(model: AiModel): (request: AiRequest) => Promise<AiReply> {
	return model.generate?.bind(model) ?? ((request) => collectStream(model, request));
}

async function postJson(
	fetchFn: typeof fetch,
	url: string,
	headers: Record<string, string>,
	body: unknown,
	signal: AbortSignal | undefined,
	modelId: string,
): Promise<Response> {
	const response = await fetchFn(url, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
		signal: signal ?? null,
	});
	if (!response.ok || response.body === null) {
		const text = response.body === null ? "empty body" : await response.text();
		throw new AiProviderError(modelId, response.status, text);
	}
	return response;
}

export interface OpenAiCompatibleOptions {
	/** model name as the provider knows it, e.g. `"gpt-4o-mini"`, `"llama3.2"`. */
	model: string;
	/** api key; omit for local servers like ollama. */
	apiKey?: string;
	/** api root, default `https://api.openai.com/v1`. ollama: `http://localhost:11434/v1`. */
	baseUrl?: string;
	/** extra headers merged into every request (openrouter attribution, etc.). */
	headers?: Record<string, string>;
	/** custom fetch — for tests, proxies, retry wrappers. */
	fetch?: typeof fetch;
}

interface OpenAiStreamEvent {
	choices?: { delta?: { content?: string | null } }[];
}

interface OpenAiCompletion {
	choices?: { message?: { content?: string | null } }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * zero-dependency adapter for any `/chat/completions` provider: openai, ollama, openrouter,
 * groq, together, mistral, deepseek — if it speaks the openai wire format, it works.
 */
export function openaiCompatible(options: OpenAiCompatibleOptions): AiModel {
	const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
	const fetchFn = options.fetch ?? fetch;
	const headers: Record<string, string> = { ...options.headers };
	if (options.apiKey !== undefined) headers.authorization = `Bearer ${options.apiKey}`;
	const id = `openai-compatible:${options.model}`;

	const body = (request: AiRequest, stream: boolean) => ({
		model: options.model,
		messages: request.messages,
		stream,
		...(request.temperature === undefined ? {} : { temperature: request.temperature }),
		...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
	});

	return {
		id,
		async *stream(request) {
			const response = await postJson(
				fetchFn,
				`${baseUrl}/chat/completions`,
				headers,
				body(request, true),
				request.signal,
				id,
			);
			for await (const data of sseData(response.body!)) {
				if (data === "[DONE]") return;
				const event = JSON.parse(data) as OpenAiStreamEvent;
				const piece = event.choices?.[0]?.delta?.content;
				if (typeof piece === "string" && piece.length > 0) yield piece;
			}
		},
		async generate(request) {
			const response = await postJson(
				fetchFn,
				`${baseUrl}/chat/completions`,
				headers,
				body(request, false),
				request.signal,
				id,
			);
			const completion = (await response.json()) as OpenAiCompletion;
			return {
				text: completion.choices?.[0]?.message?.content ?? "",
				usage: {
					inputTokens: completion.usage?.prompt_tokens,
					outputTokens: completion.usage?.completion_tokens,
				},
			};
		},
	};
}

export interface AnthropicModelOptions {
	/** model name, e.g. `"claude-sonnet-5"`. */
	model: string;
	apiKey: string;
	/** api root, default `https://api.anthropic.com`. */
	baseUrl?: string;
	/** `anthropic-version` header, default `"2023-06-01"`. */
	version?: string;
	/** anthropic requires `max_tokens`; this is the default when the request has none. */
	defaultMaxTokens?: number;
	/** custom fetch — for tests, proxies, retry wrappers. */
	fetch?: typeof fetch;
}

interface AnthropicStreamEvent {
	type?: string;
	delta?: { type?: string; text?: string };
}

interface AnthropicCompletion {
	content?: { type?: string; text?: string }[];
	usage?: { input_tokens?: number; output_tokens?: number };
}

/** direct, zero-dependency adapter for the anthropic messages api. */
export function anthropicModel(options: AnthropicModelOptions): AiModel {
	const baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
	const fetchFn = options.fetch ?? fetch;
	const headers: Record<string, string> = {
		"x-api-key": options.apiKey,
		"anthropic-version": options.version ?? "2023-06-01",
	};
	const id = `anthropic:${options.model}`;

	const body = (request: AiRequest, stream: boolean) => {
		const system = request.messages
			.filter((m) => m.role === "system")
			.map((m) => m.content)
			.join("\n\n");
		return {
			model: options.model,
			max_tokens: request.maxTokens ?? options.defaultMaxTokens ?? 4096,
			messages: request.messages.filter((m) => m.role !== "system"),
			stream,
			...(system.length > 0 ? { system } : {}),
			...(request.temperature === undefined ? {} : { temperature: request.temperature }),
		};
	};

	return {
		id,
		async *stream(request) {
			const response = await postJson(
				fetchFn,
				`${baseUrl}/v1/messages`,
				headers,
				body(request, true),
				request.signal,
				id,
			);
			for await (const data of sseData(response.body!)) {
				const event = JSON.parse(data) as AnthropicStreamEvent;
				if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
					const piece = event.delta.text;
					if (typeof piece === "string" && piece.length > 0) yield piece;
				}
			}
		},
		async generate(request) {
			const response = await postJson(
				fetchFn,
				`${baseUrl}/v1/messages`,
				headers,
				body(request, false),
				request.signal,
				id,
			);
			const completion = (await response.json()) as AnthropicCompletion;
			return {
				text: (completion.content ?? [])
					.filter((block) => block.type === "text")
					.map((block) => block.text ?? "")
					.join(""),
				usage: {
					inputTokens: completion.usage?.input_tokens,
					outputTokens: completion.usage?.output_tokens,
				},
			};
		},
	};
}

/** the structural slice of a vercel ai sdk `LanguageModel` we detect and pass through. */
export interface AiSdkLanguageModel {
	readonly specificationVersion: string;
	readonly modelId?: string;
}

interface AiSdkModule {
	streamText(options: Record<string, unknown>): { textStream: AsyncIterable<string> };
	generateText(options: Record<string, unknown>): Promise<{
		text: string;
		usage?: { inputTokens?: number; outputTokens?: number };
	}>;
}

/**
 * bridge to the vercel ai sdk: pass any `LanguageModel` (`openai("gpt-4o")`,
 * `anthropic("claude-sonnet-5")`, `ollama(...)`, …) and the whole provider ecosystem works.
 * the `ai` package is an optional peer — it's imported lazily on first use, so bots that
 * use the built-in adapters never load it.
 */
export function aiSdk(model: AiSdkLanguageModel): AiModel {
	let module: Promise<AiSdkModule> | undefined;
	const load = (): Promise<AiSdkModule> => {
		module ??= (import("ai" as string) as Promise<AiSdkModule>).catch((cause: unknown) => {
			module = undefined;
			throw new AiError(
				'ai: the vercel ai sdk bridge needs the "ai" package — install it with `pnpm add ai`',
				{ cause },
			);
		});
		return module;
	};

	const requestOptions = (request: AiRequest): Record<string, unknown> => ({
		model,
		messages: request.messages,
		...(request.signal === undefined ? {} : { abortSignal: request.signal }),
		...(request.temperature === undefined ? {} : { temperature: request.temperature }),
		...(request.maxTokens === undefined ? {} : { maxOutputTokens: request.maxTokens }),
	});

	return {
		id: `ai-sdk:${model.modelId ?? "unknown"}`,
		async *stream(request) {
			const { streamText } = await load();
			yield* streamText(requestOptions(request)).textStream;
		},
		async generate(request) {
			const { generateText } = await load();
			const result = await generateText(requestOptions(request));
			return {
				text: result.text,
				usage: {
					inputTokens: result.usage?.inputTokens,
					outputTokens: result.usage?.outputTokens,
				},
			};
		},
	};
}

/** wrap any `(request) => AsyncIterable<string>` source — the escape hatch. */
export function customModel(
	stream: (request: AiRequest) => AsyncIterable<string>,
	id = "custom",
): AiModel {
	return { id, stream };
}

/** what the plugin accepts as `model`: a ready adapter or a raw ai sdk `LanguageModel`. */
export type AiModelLike = AiModel | AiSdkLanguageModel;

/** normalize {@link AiModelLike}: ai sdk models are detected by `specificationVersion`. */
export function resolveModel(model: AiModelLike): AiModel {
	if ("stream" in model && typeof model.stream === "function") return model;
	if ("specificationVersion" in model) return aiSdk(model);
	throw new AiError(
		"ai: `model` is neither an AiModel (has .stream) nor an ai sdk LanguageModel (has .specificationVersion)",
	);
}
