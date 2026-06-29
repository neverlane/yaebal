/**
 * tiny ansi toolkit for the wizard — truecolor styling, a rounded card, screen
 * control and a keypress reader built on `node:readline`. no native deps, so it
 * runs on node, bun and deno out of the box.
 */

import readline from "node:readline";

const ESC = "\x1b[";

export const screen = {
	enter: `${ESC}?1049h`, // alternate buffer — leaves the scrollback untouched
	leave: `${ESC}?1049l`,
	clear: `${ESC}2J${ESC}H`,
	hideCursor: `${ESC}?25l`,
	showCursor: `${ESC}?25h`,
};

export function moveTo(row: number, col: number): string {
	return `${ESC}${row};${col}H`;
}

function rgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		Number.parseInt(h.slice(0, 2), 16),
		Number.parseInt(h.slice(2, 4), 16),
		Number.parseInt(h.slice(4, 6), 16),
	];
}

export interface StyleOpts {
	fg?: string;
	bg?: string;
	bold?: boolean;
	dim?: boolean;
}

/** build a styling function that wraps text in a single sgr sequence + reset. */
export function style(opts: StyleOpts): (s: string) => string {
	const codes: string[] = [];
	if (opts.fg) {
		const [r, g, b] = rgb(opts.fg);
		codes.push(`38;2;${r};${g};${b}`);
	}
	if (opts.bg) {
		const [r, g, b] = rgb(opts.bg);
		codes.push(`48;2;${r};${g};${b}`);
	}
	if (opts.bold) codes.push("1");
	if (opts.dim) codes.push("2");
	if (codes.length === 0) return (s) => s;
	const prefix = `${ESC}${codes.join(";")}m`;
	return (s) => `${prefix}${s}${ESC}0m`;
}

export const fg = (hex: string) => style({ fg: hex });

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the esc (\x1b) byte is the point
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");
/** visible width (ansi-insensitive). our content is single-width throughout. */
export const vlen = (s: string): number => stripAnsi(s).length;

/** pad a (possibly styled) string to `width` visible columns. */
export function padTo(s: string, width: number): string {
	const gap = width - vlen(s);
	return gap > 0 ? s + " ".repeat(gap) : s;
}

export interface KeyEvent {
	name: string;
	ctrl: boolean;
	shift: boolean;
	sequence: string;
}

/**
 * subscribe to keypresses on a stream. returns a cleanup fn that detaches the
 * listener and restores the terminal's raw-mode state.
 */
export function onKeypress(input: NodeJS.ReadStream, handler: (key: KeyEvent) => void): () => void {
	readline.emitKeypressEvents(input);
	const isTty = Boolean(input.isTTY);
	if (isTty && input.setRawMode) input.setRawMode(true);
	input.resume?.();

	const listener = (str: string | undefined, key: readline.Key | undefined) => {
		handler({
			name: key?.name ?? (str === " " ? "space" : (str ?? "")),
			ctrl: Boolean(key?.ctrl),
			shift: Boolean(key?.shift),
			sequence: str ?? key?.sequence ?? "",
		});
	};
	input.on("keypress", listener);

	return () => {
		input.off("keypress", listener);
		if (isTty && input.setRawMode) input.setRawMode(false);
		// release stdin so the event loop can drain and the process exits.
		input.pause?.();
	};
}
