/** low-level SVG string helpers: escaping, id scoping, numeric formatting, ticks, and the time/status meta row. */

import type { Palette } from "./theme.js";
import { FONT } from "./theme.js";
import type { TickStatus } from "./types.js";

const ESC: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** escape xml-significant characters — safe inside both text nodes and quoted attributes. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** deterministic 32-bit hash — used to seed avatar colours and media placeholder gradients. */
export const hash = (s: string): number => {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
};

export const round = (n: number): number => Math.round(n * 10) / 10;
export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export const dur = (s?: number): string => {
	const n = Math.max(0, Math.round(s ?? 0));
	return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

let renderSeq = 0;

/**
 * one `IdScope` per `renderChat` call — every `<clipPath>`/gradient id it hands out is unique
 * across calls, so two SVGs inlined on the same page (e.g. the docs playground's `{@html}`)
 * never resolve `url(#c0)` into each other's defs. pass `idPrefix` for deterministic ids in tests.
 */
export class IdScope {
	private n = 0;
	private readonly prefix: string;

	constructor(prefix?: string) {
		this.prefix = prefix ?? `y${(renderSeq++).toString(36)}`;
	}

	next(label: string): string {
		return `${this.prefix}-${label}${this.n++}`;
	}
}

/** rounded-rect path with an independent radius per corner (tl, tr, br, bl). */
export function rr(
	x: number,
	y: number,
	w: number,
	h: number,
	tl: number,
	tr: number,
	br: number,
	bl: number,
): string {
	return `M${round(x + tl)},${round(y)}h${round(w - tl - tr)}a${tr},${tr} 0 0 1 ${tr},${tr}v${round(h - tr - br)}a${br},${br} 0 0 1 ${-br},${br}h${round(-(w - br - bl))}a${bl},${bl} 0 0 1 ${-bl},${-bl}v${round(-(h - bl - tl))}a${tl},${tl} 0 0 1 ${tl},${-tl}z`;
}

export function ticks(x: number, y: number, status: TickStatus, color: string): string {
	// telegram proportions: short down-stroke into a vertex, longer up-stroke; the double tick
	// offsets the second check by ~half its width so both read clearly.
	const one = (ox: number) =>
		`<path d="M${round(ox)},${round(y)} l2.3,2.6 l5.6,-6.4" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;

	return status === "sent" ? one(x + 3) : one(x) + one(x + 4.6);
}

/** time + ticks (+ edited marker) at a right edge; `scrim` draws a dark pill (over media). */
export function meta(
	rightX: number,
	bottomY: number,
	time: string,
	status: TickStatus | undefined,
	out: boolean,
	p: Palette,
	scrim: boolean,
	edited?: boolean,
): string {
	if (!time && !status && !edited) return "";

	const label = metaLabel(time, edited);
	const tickW = out && status ? 15 : 0;
	const tw = label.length * (11 * 0.55);

	let s = "";
	const color = scrim ? "#fff" : p.meta;

	if (scrim) {
		const pw = tw + tickW + 16;
		s += `<rect x="${round(rightX - pw)}" y="${round(bottomY - 17)}" width="${round(pw)}" height="18" rx="9" fill="${p.scrim}"/>`;
	}

	if (label)
		s += `<text x="${round(rightX - tickW)}" y="${round(bottomY - 4)}" font-size="11" fill="${color}" text-anchor="end" font-family="${FONT}">${esc(label)}</text>`;

	if (out && status)
		s += ticks(round(rightX - 12), round(bottomY - 5), status, scrim ? "#fff" : p.tick);

	return s;
}

/** the exact text `meta()` renders — shared so the width reserved for it (see `metaWidth`) can
 * never drift out of sync with what actually gets drawn (an "edited" prefix is longer than a
 * bare time, and a stale estimate here would let the label overlap the message text). */
const metaLabel = (time: string, edited?: boolean): string =>
	edited ? `edited${time ? ` ${time}` : ""}` : time;

/** measured width of a meta (time/ticks) label, for reserving inline space next to text. */
export const metaWidth = (
	time: string,
	out: boolean,
	hasStatus: boolean,
	edited?: boolean,
): number => metaLabel(time, edited).length * 6 + (out && hasStatus ? 16 : 0);
