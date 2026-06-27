import type { Context, Message, Plugin } from "@yaebal/core";

/** Telegram's per-message text limit. */
export const MAX_MESSAGE_LENGTH = 4096;

/**
 * Split `text` into chunks no longer than `max`, preferring to break on newlines.
 * A single line longer than `max` is hard-split. Pure — exported for testing.
 */
export function split(text: string, max = MAX_MESSAGE_LENGTH): string[] {
	if (text.length <= max) return [text];
	const chunks: string[] = [];
	let current = "";
	const flush = () => {
		if (current.length > 0) {
			chunks.push(current);
			current = "";
		}
	};
	for (const line of text.split("\n")) {
		if (line.length > max) {
			flush();
			for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
			continue;
		}
		const candidate = current.length > 0 ? `${current}\n${line}` : line;
		if (candidate.length > max) {
			flush();
			current = line;
		} else {
			current = candidate;
		}
	}
	flush();
	return chunks;
}

export interface SplitControl {
	/** Send `text`, automatically split into Telegram-sized chunks. */
	sendLong(text: string, extra?: Record<string, unknown>): Promise<Message[]>;
	/** Reply with `text`, automatically split. */
	replyLong(text: string, extra?: Record<string, unknown>): Promise<Message[]>;
}

/** Adds `ctx.sendLong` / `ctx.replyLong` that split overlong text across messages. */
export function splitter(max = MAX_MESSAGE_LENGTH): Plugin<Context, SplitControl> {
	return (composer) =>
		composer.derive((ctx) => {
			const control: SplitControl = {
				async sendLong(text, extra) {
					const out: Message[] = [];
					for (const part of split(text, max)) out.push(await ctx.send(part, extra));
					return out;
				},
				async replyLong(text, extra) {
					const out: Message[] = [];
					for (const part of split(text, max)) out.push(await ctx.reply(part, extra));
					return out;
				},
			};
			return control;
		});
}
