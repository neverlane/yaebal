import { type UpdateSink, type WebhookOptions, webhookCallback } from "@yaebal/core";

/**
 * @yaebal/web — run your bot on edge/web runtimes (Cloudflare Workers, Deno
 * Deploy, Bun, Vercel Edge) via webhooks. The bot needs no long-polling: it just
 * turns each incoming `Request` into an update.
 *
 *   // Cloudflare Workers / Deno Deploy / Vercel Edge
 *   export default { fetch: webhook(bot, { secretToken: env.SECRET }) };
 *
 *   // Bun / Deno standalone
 *   serve(bot, { port: 8080, secretToken: process.env.SECRET });
 */

export type { WebhookOptions, UpdateSink } from "@yaebal/core";

/** Minimal bot surface the lifecycle helpers need. */
interface ApiBot {
	api: { call(method: string, params?: Record<string, unknown>): Promise<unknown> };
}

/**
 * A fetch handler — `(Request) => Promise<Response>` — for any edge/web runtime.
 * Drop it into a Worker's `fetch`, `Deno.serve`, `Bun.serve`, etc.
 */
export function webhook(
	bot: UpdateSink,
	options?: WebhookOptions,
): (request: Request) => Promise<Response> {
	return webhookCallback(bot, options);
}

export interface SetWebhookOptions {
	/** Secret token Telegram echoes back in `X-Telegram-Bot-Api-Secret-Token` (pass the same to `webhook`). */
	secretToken?: string;
	/** Restrict the update types Telegram sends. */
	allowedUpdates?: string[];
	/** Drop updates that piled up while the webhook was unset. */
	dropPendingUpdates?: boolean;
	/** Max simultaneous HTTPS connections (1–100). */
	maxConnections?: number;
}

/** Register this bot's webhook with Telegram — call once on deploy. */
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

/** Remove this bot's webhook (e.g. to switch back to long-polling). */
export async function deleteWebhook(bot: ApiBot, dropPendingUpdates = false): Promise<void> {
	await bot.api.call("deleteWebhook", { drop_pending_updates: dropPendingUpdates });
}

export interface ServeOptions extends WebhookOptions {
	/** Listen port. Default 8080. */
	port?: number;
	/** Listen hostname. */
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
 * Start a standalone webhook server using the runtime's native fetch server
 * (Bun or Deno). On Node use `nodeWebhookCallback` from `@yaebal/core`; on edge,
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
			"serve() requires Bun or Deno. On Node use nodeWebhookCallback from @yaebal/core; on edge export { fetch: webhook(bot) }.",
		);
	}
}
