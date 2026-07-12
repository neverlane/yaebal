import type { Context, Message, Middleware } from "@yaebal/core";
import type { AutoTrackKind } from "./types.js";

const COMMAND_RE = /^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s|$)/;

function messageContentType(message: Message | undefined): string {
	if (!message) return "unknown";
	if (message.text !== undefined) return "text";
	if (message.photo) return "photo";
	if (message.video) return "video";
	if (message.document) return "document";
	if (message.sticker) return "sticker";
	if (message.voice) return "voice";
	if (message.audio) return "audio";
	if (message.animation) return "animation";
	if (message.contact) return "contact";
	if (message.location) return "location";
	if (message.venue) return "venue";
	if (message.poll) return "poll";
	if (message.dice) return "dice";
	if (message.video_note) return "video_note";
	if (message.game) return "game";
	if (message.invoice) return "invoice";
	if (message.successful_payment) return "successful_payment";
	if (message.web_app_data) return "web_app_data";
	return "other";
}

/** the context surface `autoTrack` needs — just `ctx.track`, kept structural so this module
 * doesn't depend on `AnalyticsControl`'s full (catalog-typed) shape. */
interface Trackable {
	track(name: string, properties?: Record<string, unknown>): void;
}

/**
 * build the auto-capture middleware for `AnalyticsOptions.autoTrack` — installed by `analytics()`
 * as the FIRST middleware in the chain, so it observes every update (including ones a downstream
 * `command`/`callbackQuery`/`on` filter would otherwise consume) but tracks AFTER calling `next()`,
 * so a command handler that changes `ctx` state (e.g. `derive`-based session hydration) has
 * already run.
 *
 * every kind emits a FIXED event name with the dynamic bit as a *property* (`command_used` +
 * `{ command }`, not `command.start`) — an event name per distinct command/callback payload would
 * blow up adapters' event schemas, since posthog/plausible/your own SQL all key funnels off the
 * event name, not property values.
 */
export function autoCaptureMiddleware<C extends Context & Trackable>(
	kinds: readonly AutoTrackKind[],
): Middleware<C> {
	const wantCommands = kinds.includes("commands");
	const wantCallbacks = kinds.includes("callback_queries");
	const wantMessages = kinds.includes("messages");

	return async (ctx, next) => {
		await next();

		if (wantCommands && ctx.updateType === "message") {
			const match = ctx.message?.text?.match(COMMAND_RE);
			if (match?.[1]) {
				ctx.track("command_used", { command: match[1].toLowerCase() });
				return;
			}
		}

		if (wantCallbacks && ctx.updateType === "callback_query") {
			ctx.track("callback_query", { data: ctx.callbackQuery?.data });
			return;
		}

		if (wantMessages && ctx.updateType === "message") {
			ctx.track("message_received", { contentType: messageContentType(ctx.message) });
		}
	};
}
