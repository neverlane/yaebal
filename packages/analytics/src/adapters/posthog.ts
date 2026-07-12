import type { AnalyticsAdapter, AnalyticsEvent } from "../types.js";

/** the subset of a posthog client the adapter needs — `posthog-node`'s `PostHog` satisfies it
 * structurally, no driver dependency required. */
export interface PostHogLike {
	capture(payload: {
		distinctId: string;
		event: string;
		properties?: Record<string, unknown>;
		timestamp?: Date;
	}): unknown;
	identify?(payload: { distinctId: string; properties?: Record<string, unknown> }): unknown;
	flush?(): Promise<unknown>;
}

export interface PostHogAdapterOptions {
	/** derive posthog's `distinctId`. defaults to `userId`, falling back to `chatId`, then `"anonymous"`. */
	distinctId?: (event: AnalyticsEvent) => string;
}

/** forward events to an existing `posthog-node` client (or anything shaped like one). */
export function postHogAdapter(
	client: PostHogLike,
	options: PostHogAdapterOptions = {},
): AnalyticsAdapter {
	const customDistinctId = options.distinctId;
	const defaultDistinctId = (event: AnalyticsEvent) =>
		String(event.userId ?? event.chatId ?? "anonymous");

	return {
		track(event) {
			const distinctId = customDistinctId ? customDistinctId(event) : defaultDistinctId(event);
			const properties: Record<string, unknown> = { ...event.properties };
			if (event.chatId !== undefined) properties.chatId = event.chatId;
			// a custom distinctId() means posthog's own identity no longer carries userId — keep it
			// reachable as a property, otherwise it's gone from posthog entirely.
			if (customDistinctId && event.userId !== undefined) properties.userId = event.userId;

			return client.capture({
				distinctId,
				event: event.name,
				properties,
				timestamp: new Date(event.timestamp),
			});
		},
		identify: client.identify
			? (id, properties) => client.identify?.({ distinctId: id, properties })
			: undefined,
		flush: client.flush ? () => client.flush?.() : undefined,
	};
}
