import { type UpdateSink, type WebhookOptions, webhookCallback } from "@yaebal/core";

/**
 * @yaebal/web — run your bot on edge/web runtimes (cloudflare workers, deno
 * deploy, bun, vercel edge) via webhooks. the bot needs no long-polling: it just
 * turns each incoming `Request` into an update.
 *
 *   // cloudflare workers / deno deploy / vercel edge
 *   export default { fetch: webhook(bot, { secretToken: env.SECRET }) };
 *
 *   // bun / deno standalone
 *   serve(bot, { port: 8080, secretToken: process.env.SECRET });
 */

export type { UpdateSink, WebhookOptions } from "@yaebal/core";

/** minimal bot surface the lifecycle helpers need. */
interface ApiBot {
	api: { call(method: string, params?: Record<string, unknown>): Promise<unknown> };
}

/**
 * a fetch handler — `(Request) => Promise<Response>` — for any edge/web runtime.
 * drop it into a worker's `fetch`, `Deno.serve`, `Bun.serve`, etc.
 */
export function webhook(
	bot: UpdateSink,
	options?: WebhookOptions,
): (request: Request) => Promise<Response> {
	return webhookCallback(bot, options);
}

export interface SetWebhookOptions {
	/** secret token telegram echoes back in `X-Telegram-Bot-Api-Secret-Token` (pass the same to `webhook`). */
	secretToken?: string;
	/** restrict the update types telegram sends. */
	allowedUpdates?: string[];
	/** drop updates that piled up while the webhook was unset. */
	dropPendingUpdates?: boolean;
	/** max simultaneous HTTPS connections (1–100). */
	maxConnections?: number;
}

/** register this bot's webhook with telegram — call once on deploy. */
export async function setWebhook(
	bot: ApiBot,
	url: string,
	options: SetWebhookOptions = {},
): Promise<void> {
	await bot.api.call("setWebhook", {
		url,
		secret_token: options.secretToken,
		allowed_updates: options.allowedUpdates,
		drop_pending_updates: options.dropPendingUpdates,
		max_connections: options.maxConnections,
	});
}

/** remove this bot's webhook (e.g. to switch back to long-polling). */
export async function deleteWebhook(bot: ApiBot, dropPendingUpdates = false): Promise<void> {
	await bot.api.call("deleteWebhook", { drop_pending_updates: dropPendingUpdates });
}

export interface ServeOptions extends WebhookOptions {
	/** listen port. defaults to 8080. */
	port?: number;
	/** listen hostname. */
	hostname?: string;
}

type FetchHandler = (request: Request) => Promise<Response>;

interface BunRuntime {
	serve(options: { port?: number; hostname?: string; fetch: FetchHandler }): unknown;
}

interface DenoRuntime {
	serve(options: { port?: number; hostname?: string }, handler: FetchHandler): unknown;
}

/**
 * start a standalone webhook server using the runtime's native fetch server
 * (bun or deno). on node use `nodeWebhookCallback` from `@yaebal/core`; on edge,
 * export `{ fetch: webhook(bot) }` instead.
 */
export function serve(bot: UpdateSink, options: ServeOptions = {}): void {
	const handler = webhook(bot, options);
	const runtime = globalThis as { Bun?: BunRuntime; Deno?: DenoRuntime };

	if (runtime.Bun) {
		runtime.Bun.serve({ port: options.port ?? 8080, hostname: options.hostname, fetch: handler });
	} else if (runtime.Deno) {
		runtime.Deno.serve({ port: options.port ?? 8080, hostname: options.hostname }, handler);
	} else {
		throw new Error(
			"serve() requires bun or deno. on node use nodeWebhookCallback from @yaebal/core; on edge export { fetch: webhook(bot) }.",
		);
	}
}
