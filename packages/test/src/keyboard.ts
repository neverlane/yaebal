import { toPlain } from "./normalize.js";

/** an inline keyboard button found by {@link findButton}, with its position. */
export interface FoundButton {
	text: string;
	row: number;
	col: number;
	[key: string]: unknown;
}

/**
 * search an inline keyboard (a `reply_markup`-shaped object — or an `InlineKeyboard`/`Keyboard`
 * builder instance, unwrapped via `toJSON()` automatically — e.g. from a recorded call's params,
 * or a {@link BotMessage}'s `reply_markup`) for a button whose text matches a string or regex.
 * returns the button (plus its `row`/`col`) or `undefined`.
 */
export function findButton(markup: unknown, match: string | RegExp): FoundButton | undefined {
	const plain = toPlain<{ inline_keyboard?: Array<Array<Record<string, unknown>>> } | undefined>(
		markup,
	);
	const rows = plain?.inline_keyboard ?? [];

	for (let row = 0; row < rows.length; row++) {
		const cols = rows[row] ?? [];

		for (let col = 0; col < cols.length; col++) {
			const button = cols[col];
			if (!button) continue;

			const text = typeof button.text === "string" ? button.text : "";
			const matches = typeof match === "string" ? text === match : match.test(text);

			if (matches) return { ...button, text, row, col };
		}
	}

	return undefined;
}
