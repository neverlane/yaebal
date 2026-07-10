import {
	type UpdateSink,
	type WebhookExecutionContext,
	type WebhookHandler,
	type WebhookOptions,
	webhookCallback,
} from "@yaebal/core";

/**
 * framework adapters. `webhook(bot)` already returns a standard fetch handler
 * that drops straight into every fetch-native runtime (cloudflare, deno, bun,
 * hono, elysia, next.js app router, sveltekit, vercel edge). these adapters wrap
 * that handler for the frameworks whose handler shape *isn't* `(Request) =>
 * Response` — node's express/koa/fastify, the serverless event models (aws
 * lambda, azure functions), and the fetch runtimes that carry a `waitUntil`
 * escape hatch worth wiring (cloudflare, sveltekit).
 *
 * every adapter forwards the `X-Telegram-Bot-Api-Secret-Token` header and the
 * request path, so `secretToken` and `path` in {@link WebhookOptions} work
 * identically across all of them. all are zero-`node:`-import: node request
 * bodies are consumed through the stream/event interface, never `node:stream`.
 */

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

/** a node `IncomingMessage`-shaped stream, without importing `node:http`. */
interface NodeReadable {
	on(event: string, listener: (arg: unknown) => void): unknown;
}

function isNodeReadable(v: unknown): v is NodeReadable {
	return typeof v === "object" && v !== null && typeof (v as NodeReadable).on === "function";
}

function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as Record<symbol, unknown>)[Symbol.asyncIterator] === "function"
	);
}

const toBytes = (chunk: unknown): Uint8Array =>
	typeof chunk === "string"
		? new TextEncoder().encode(chunk)
		: chunk instanceof Uint8Array
			? chunk
			: new Uint8Array(chunk as ArrayBuffer);

function collectNodeStream(stream: NodeReadable): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let total = 0;

		stream.on("data", (chunk) => {
			const bytes = toBytes(chunk);
			chunks.push(bytes);
			total += bytes.byteLength;
		});
		stream.on("end", () => {
			const out = new Uint8Array(total);
			let offset = 0;
			for (const chunk of chunks) {
				out.set(chunk, offset);
				offset += chunk.byteLength;
			}
			resolve(out);
		});
		stream.on("error", (error) => reject(error));
	});
}

/**
 * normalise whatever a framework hands us as a body into a UTF-8 string:
 * already-parsed objects re-serialise to JSON, raw buffers/streams are read out.
 */
async function readBody(source: unknown): Promise<string> {
	if (source === undefined || source === null) return "";
	if (typeof source === "string") return source;
	if (source instanceof Uint8Array) return new TextDecoder().decode(source);
	if (source instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(source));

	if (isAsyncIterable(source)) {
		let text = "";
		const decoder = new TextDecoder();
		for await (const chunk of source) text += decoder.decode(toBytes(chunk), { stream: true });
		return text + decoder.decode();
	}
	if (isNodeReadable(source)) return new TextDecoder().decode(await collectNodeStream(source));

	// a parsed body object (fastify, express.json, azure) — round-trip it.
	return JSON.stringify(source);
}

type HeaderBag = Record<string, string | string[] | undefined> | Headers | undefined;

function toHeaders(input: HeaderBag): Headers {
	const headers = new Headers();
	if (!input) return headers;
	if (input instanceof Headers) return input;

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) for (const v of value) headers.append(key, v);
		else headers.set(key, value);
	}

	return headers;
}

interface RequestParts {
	method?: string;
	path?: string;
	host?: string;
	headers?: HeaderBag;
	body: string;
}

function buildRequest(parts: RequestParts): Request {
	const host = parts.host || "webhook.local";
	const path = parts.path || "/";
	const url = /^https?:\/\//.test(path)
		? path
		: `https://${host}${path.startsWith("/") ? "" : "/"}${path}`;
	const method = parts.method || "POST";
	const headers = toHeaders(parts.headers);
	// content-length from the origin request no longer matches our re-encoded
	// body; drop it so the runtime computes a correct one.
	headers.delete("content-length");

	const init: RequestInit = { method, headers };
	if (method !== "GET" && method !== "HEAD") init.body = parts.body;

	return new Request(url, init);
}

interface FlatResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
}

async function flatten(response: Response): Promise<FlatResponse> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});

	return { status: response.status, headers, body: await response.text() };
}

/** re-usable "read the request → run → return the fetch Response" spine. */
function fetchBridge(
	handler: WebhookHandler,
	parts: RequestParts,
	execution?: WebhookExecutionContext,
): Promise<Response> {
	return handler(buildRequest(parts), execution);
}

// ---------------------------------------------------------------------------
// fetch-native adapters (Request in, Response out) — waitUntil wiring
// ---------------------------------------------------------------------------

interface HonoContext {
	req: { raw: Request };
	env?: unknown;
	executionCtx?: WebhookExecutionContext;
}

/** [hono](https://hono.dev) — `app.post("/", honoAdapter(bot))`. wires `c.executionCtx.waitUntil`. */
export function honoAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (c: HonoContext) => Promise<Response> {
	const handler = webhookCallback(bot, options);
	return (c) => handler(c.req.raw, c.executionCtx);
}

interface ElysiaContext {
	request: Request;
}

/** [elysia](https://elysiajs.com) — `app.post("/", elysiaAdapter(bot))`. */
export function elysiaAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (ctx: ElysiaContext) => Promise<Response> {
	const handler = webhookCallback(bot, options);
	return (ctx) => handler(ctx.request);
}

interface CloudflareExecutionCtx {
	waitUntil(promise: Promise<unknown>): void;
}

/**
 * [cloudflare workers](https://workers.cloudflare.com) module syntax —
 * `export default { fetch: cloudflareAdapter(bot) }`. threads `ctx.waitUntil` so
 * an update that outlives the response (under `onTimeout: "ack"`) still runs.
 */
export function cloudflareAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (request: Request, env: unknown, ctx: CloudflareExecutionCtx) => Promise<Response> {
	const handler = webhookCallback(bot, options);
	return (request, _env, ctx) => handler(request, ctx);
}

/**
 * [next.js](https://nextjs.org) app-router route handler —
 * `export const POST = nextAdapter(bot)`. also fits any `(Request) => Response`
 * route (remix, astro, `export const POST`).
 */
export function nextAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (request: Request) => Promise<Response> {
	return webhookCallback(bot, options);
}

interface SvelteRequestEvent {
	request: Request;
	platform?: { context?: WebhookExecutionContext };
}

/**
 * [sveltekit](https://kit.svelte.dev) endpoint —
 * `export const POST = svelteKitAdapter(bot)`. picks up
 * `platform.context.waitUntil` on the cloudflare adapter.
 */
export function svelteKitAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (event: SvelteRequestEvent) => Promise<Response> {
	const handler = webhookCallback(bot, options);
	return (event) => handler(event.request, event.platform?.context);
}

// ---------------------------------------------------------------------------
// node frameworks (req/res or ctx) — bodies read without node: imports
// ---------------------------------------------------------------------------

interface NodeResponse {
	statusCode?: number;
	setHeader?(name: string, value: string): unknown;
	end(body?: string): unknown;
}

interface NodeRequestLike {
	method?: string;
	url?: string;
	originalUrl?: string;
	headers?: Record<string, string | string[] | undefined>;
	body?: unknown;
	rawBody?: unknown;
}

async function sendNode(response: Response, res: NodeResponse): Promise<void> {
	const flat = await flatten(response);
	res.statusCode = flat.status;
	for (const [key, value] of Object.entries(flat.headers)) res.setHeader?.(key, value);
	res.end(flat.body);
}

/**
 * [express](https://expressjs.com) / [google cloud functions](https://cloud.google.com/functions)
 * / firebase — `app.post("/", expressAdapter(bot))`. works with or without
 * `express.json()`: a parsed `req.body`, a raw `req.rawBody` buffer, or the
 * request stream are all handled.
 */
export function expressAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (req: NodeRequestLike, res: NodeResponse) => Promise<void> {
	const handler = webhookCallback(bot, options);
	return async (req, res) => {
		const source = req.body ?? req.rawBody ?? req;
		const body = await readBody(source);
		const response = await fetchBridge(handler, {
			method: req.method,
			path: req.originalUrl ?? req.url,
			host: headerValue(req.headers, "host"),
			headers: req.headers,
			body,
		});
		await sendNode(response, res);
	};
}

/** alias — google cloud functions and firebase https functions share express's `(req, res)` shape. */
export const gcfAdapter = expressAdapter;

interface FastifyRequest {
	method?: string;
	url?: string;
	headers?: Record<string, string | string[] | undefined>;
	body?: unknown;
}

interface FastifyReply {
	code(status: number): FastifyReply;
	header(name: string, value: string): FastifyReply;
	send(payload: string): unknown;
}

/**
 * [fastify](https://fastify.dev) — `fastify.post("/", fastifyAdapter(bot))`.
 * fastify parses the JSON body itself; the adapter re-serialises `request.body`.
 */
export function fastifyAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
	const handler = webhookCallback(bot, options);
	return async (request, reply) => {
		const body = await readBody(request.body ?? "");
		const response = await fetchBridge(handler, {
			method: request.method,
			path: request.url,
			host: headerValue(request.headers, "host"),
			headers: request.headers,
			body,
		});
		const flat = await flatten(response);
		reply.code(flat.status);
		for (const [key, value] of Object.entries(flat.headers)) reply.header(key, value);
		reply.send(flat.body);
	};
}

interface KoaContext {
	method?: string;
	url?: string;
	headers?: Record<string, string | string[] | undefined>;
	req?: unknown;
	request?: { body?: unknown };
	status: number;
	body: unknown;
	set(field: string, value: string): unknown;
}

/**
 * [koa](https://koajs.com) — `router.post("/", koaAdapter(bot))`. reads
 * `ctx.request.body` when a body parser ran, otherwise the raw `ctx.req` stream.
 */
export function koaAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (ctx: KoaContext) => Promise<void> {
	const handler = webhookCallback(bot, options);
	return async (ctx) => {
		const source = ctx.request?.body ?? ctx.req;
		const body = await readBody(source);
		const response = await fetchBridge(handler, {
			method: ctx.method,
			path: ctx.url,
			host: headerValue(ctx.headers, "host"),
			headers: ctx.headers,
			body,
		});
		const flat = await flatten(response);
		ctx.status = flat.status;
		for (const [key, value] of Object.entries(flat.headers)) ctx.set(key, value);
		ctx.body = flat.body;
	};
}

// ---------------------------------------------------------------------------
// serverless event models
// ---------------------------------------------------------------------------

interface ApiGatewayEvent {
	body?: string | null;
	isBase64Encoded?: boolean;
	headers?: Record<string, string | undefined>;
	httpMethod?: string;
	path?: string;
	rawPath?: string;
	requestContext?: { http?: { method?: string; path?: string } };
}

interface ApiGatewayResult {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
}

/**
 * [aws lambda](https://aws.amazon.com/lambda/) behind api gateway / function url
 * (v1 or v2 proxy event) — `export const handler = awsLambdaAdapter(bot)`.
 * returns the `{ statusCode, headers, body }` result (async model).
 */
export function awsLambdaAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (event: ApiGatewayEvent) => Promise<ApiGatewayResult> {
	const handler = webhookCallback(bot, options);
	return async (event) => {
		const raw = event.body ?? "";
		const body = event.isBase64Encoded
			? new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)))
			: raw;
		const response = await fetchBridge(handler, {
			method: event.httpMethod ?? event.requestContext?.http?.method,
			path: event.rawPath ?? event.path ?? event.requestContext?.http?.path,
			headers: event.headers,
			body,
		});
		const flat = await flatten(response);
		return { statusCode: flat.status, headers: flat.headers, body: flat.body };
	};
}

interface AzureRequest {
	method?: string;
	url?: string;
	headers?: Record<string, string | undefined>;
	body?: unknown;
	rawBody?: unknown;
}

interface AzureContext {
	res?: { status?: number; headers?: Record<string, string>; body?: string };
}

/**
 * [azure functions](https://azure.microsoft.com/products/functions) (v3 model) —
 * `module.exports = azureAdapter(bot)`. sets `context.res`.
 */
export function azureAdapter(
	bot: UpdateSink,
	options?: WebhookOptions,
): (context: AzureContext, req: AzureRequest) => Promise<void> {
	const handler = webhookCallback(bot, options);
	return async (context, req) => {
		const body = await readBody(req.rawBody ?? req.body ?? "");
		const response = await fetchBridge(handler, {
			method: req.method,
			path: req.url,
			headers: req.headers,
			body,
		});
		const flat = await flatten(response);
		context.res = { status: flat.status, headers: flat.headers, body: flat.body };
	};
}

function headerValue(
	headers: Record<string, string | string[] | undefined> | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined;
	const value = headers[name] ?? headers[name.toLowerCase()];
	return Array.isArray(value) ? value[0] : value;
}

/**
 * every adapter, keyed for discoverability: `adapters.express(bot)`,
 * `adapters.hono(bot)`, … the named `*Adapter` exports are the tree-shakeable
 * form of the same functions.
 */
export const adapters = {
	hono: honoAdapter,
	elysia: elysiaAdapter,
	cloudflare: cloudflareAdapter,
	next: nextAdapter,
	sveltekit: svelteKitAdapter,
	express: expressAdapter,
	gcf: gcfAdapter,
	fastify: fastifyAdapter,
	koa: koaAdapter,
	awsLambda: awsLambdaAdapter,
	azure: azureAdapter,
} as const;
