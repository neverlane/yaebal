/**
 * palette for the wizard — the same black-on-blue look as the docs site
 * (`--blue: #2a7ce1`). deliberately minimal: one accent, a few greys.
 */

export const theme = {
	bg: "#0a0a0c",
	panel: "#0e0e10",
	border: "#2a2a2e",
	borderActive: "#2a7ce1",
	text: "#e1e1e1",
	dim: "#75757e",
	accent: "#2a7ce1",
	accentBright: "#2f8af9",
	good: "#30bd1b",
	warn: "#f1b338",
	bad: "#ed2236",
	cursorBg: "#15161c",
} as const;

export const TITLE = "create-yaebal";
export const TAGLINE = "scaffold a type-safe telegram bot";

/** fixed card width — keeps the wizard readable and centred on any terminal. */
export const CARD_WIDTH = 62;
