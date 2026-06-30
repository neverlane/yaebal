import type { Context, Message, Plugin } from "@yaebal/core";

/** called once per album, with every message in the group. */
export type MediaGroupHandler = (ctx: Context, messages: Message[]) => unknown | Promise<unknown>;

export interface MediaGroupOptions {
	/** how long to wait for more album parts before firing. defaults to 200ms. */
	delayMs?: number;
}

interface Group {
	ctx: Context;
	messages: Message[];
	timer: ReturnType<typeof setTimeout>;
}

/**
 * telegram delivers an album as separate updates sharing a `media_group_id`.
 * this buffers them and fires `handler(ctx, messages)` once, after a short
 * debounce. album parts are consumed — they don't reach other handlers.
 */
export function mediaGroup(
	handler: MediaGroupHandler,
	options: MediaGroupOptions = {},
): Plugin<Context, Record<never, never>> {
	const delayMs = options.delayMs ?? 200;
	const groups = new Map<string, Group>();

	const flush = (id: string): void => {
		const group = groups.get(id);
		if (!group) return;

		groups.delete(id);
		void handler(group.ctx, group.messages);
	};

	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use((ctx, next) => {
			const msg = ctx.message as (Message & { media_group_id?: string }) | undefined;
			const id = msg?.media_group_id;

			if (!msg || id === undefined) return next();

			const group = groups.get(id);
			if (group) {
				group.messages.push(msg);
				clearTimeout(group.timer);

				group.timer = setTimeout(() => flush(id), delayMs);
			} else {
				groups.set(id, { ctx, messages: [msg], timer: setTimeout(() => flush(id), delayMs) });
			}

			// consumed — the album is handled here
		});

	return plugin;
}
