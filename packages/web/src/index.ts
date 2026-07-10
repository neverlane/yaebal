import {
	type UpdateSink,
	type WebhookHandler,
	type WebhookOptions,
	webhookCallback,
} from "@yaebal/core";

/**
 * @yaebal/web — run your bot on edge/web runtimes and every mainstream server
 * framework via webhooks. `fetch`-first, zero static `node:` imports.
 *
 *   // any fetch runtime (cloudflare, deno, bun, vercel edge, hono, elysia…)
 *   export default { fetch: webhook(bot, { secretToken: env.SECRET }) };
 *
 *   // node / bun / deno standalone server
 *   const server = await serve(bot, { port: 8080, secretToken: SECRET });
 *
 *   // a specific framework
 *   app.post("/", expressAdapter(bot, { secretToken: SECRET }));
 *
 * plus the webhook lifecycle (`setWebhook` / `deleteWebhook` / `getWebhookInfo`)
 * and the combinators every serious webhook deployment needs
 * (`sequentialize`, `dedupe`, `isTelegramIp`).
 */

export type {
	HandleUpdateOptions,
	UpdateSink,
	WebhookExecutionContext,
	WebhookHandler,
	WebhookOptions,
} from "@yaebal/core";

/**
 * a fetch handler — `(Request, execution?) => Promise<Response>` — for any
 * edge/web runtime. drop it into a worker's `fetch`, `Deno.serve`, `Bun.serve`,
 * hono/elysia routes, next.js/sveltekit endpoints, etc. the optional second
 * argument is the platform execution context (cloudflare's `ctx`) — pass it so
 * a timed-out update can finish via `waitUntil`.
 */
export function webhook(bot: UpdateSink, options?: WebhookOptions): WebhookHandler {
	return webhookCallback(bot, options);
}

export {
	adapters,
	awsLambdaAdapter,
	azureAdapter,
	cloudflareAdapter,
	elysiaAdapter,
	expressAdapter,
	fastifyAdapter,
	gcfAdapter,
	honoAdapter,
	koaAdapter,
	nextAdapter,
	svelteKitAdapter,
} from "./adapters.js";
export { type DedupeOptions, dedupe } from "./dedupe.js";
export {
	type ApiBot,
	type DeleteWebhookOptions,
	deleteWebhook,
	getWebhookInfo,
	type SetWebhookOptions,
	setWebhook,
} from "./lifecycle.js";
export { type KeyFn, sequentialize } from "./sequentialize.js";
export { type ServeOptions, type ServerHandle, serve } from "./serve.js";
export { isTelegramIp, TELEGRAM_IP_RANGES } from "./telegram-ip.js";
