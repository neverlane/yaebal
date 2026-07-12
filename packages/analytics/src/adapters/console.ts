import type { AnalyticsAdapter } from "../types.js";

/** a sink for local development: pretty-prints every event to `console.log`. */
export function consoleAdapter(): AnalyticsAdapter {
	return {
		track(event) {
			console.log(`[analytics] ${event.name}`, {
				userId: event.userId,
				chatId: event.chatId,
				properties: event.properties,
			});
		},
		identify(id, properties) {
			console.log(`[analytics] identify ${id}`, properties);
		},
	};
}
