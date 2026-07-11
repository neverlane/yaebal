/** styled-text tokenizing, wrapping, and SVG `<text>` layout. */

import type { MessageEntity } from "@yaebal/types";
import { esc, round } from "./svg.js";
import type { Palette } from "./theme.js";
import { ASC, charW, FONT, LH, MONO, monoW } from "./theme.js";
import { clusterWidth, graphemes } from "./unicode.js";

/** a positioned, self-sizing chunk of content. */
export interface Block {
	w: number;
	h: number;
	render: (x: number, y: number) => string;
}

export interface Run {
	text: string;
	space: boolean;
	b?: boolean;
	i?: boolean;
	u?: boolean;
	st?: boolean;
	mono?: boolean;
	spoiler?: boolean;
	link?: boolean;
}

const LINKY = new Set([
	"text_link",
	"url",
	"mention",
	"text_mention",
	"hashtag",
	"cashtag",
	"bot_command",
	"email",
	"phone_number",
]);

function styleFor(entities: MessageEntity[], i: number): Omit<Run, "text" | "space"> {
	const s: Omit<Run, "text" | "space"> = {};

	for (const e of entities) {
		if (i < e.offset || i >= e.offset + e.length) continue;

		if (e.type === "bold") s.b = true;
		else if (e.type === "italic") s.i = true;
		else if (e.type === "underline") s.u = true;
		else if (e.type === "strikethrough") s.st = true;
		else if (e.type === "code" || e.type === "pre") s.mono = true;
		else if (e.type === "spoiler") s.spoiler = true;
		else if (LINKY.has(e.type)) s.link = true;
	}

	return s;
}

const runKey = (r: Omit<Run, "text" | "space">, space: boolean): string =>
	`${space ? 1 : 0}${r.b ? "b" : ""}${r.i ? "i" : ""}${r.u ? "u" : ""}${r.st ? "s" : ""}${r.mono ? "m" : ""}${r.spoiler ? "x" : ""}${r.link ? "l" : ""}`;

/**
 * tokenize into styled runs per paragraph. iterates grapheme clusters (not UTF-16 code units) so
 * a run never ends mid-surrogate-pair or mid-ZWJ-sequence; entity offsets are still UTF-16 code
 * unit offsets per the Bot API spec, so we track a running code-unit index alongside the cluster.
 */
function tokenize(text: string, entities: MessageEntity[]): Run[][] {
	const paras: Run[][] = [];

	let runs: Run[] = [];
	let cur: Run | null = null;
	let curKey = "";
	let codeUnitIndex = 0;

	for (const cluster of graphemes(text)) {
		if (cluster === "\n") {
			if (cur) runs.push(cur);

			cur = null;
			curKey = "";
			paras.push(runs);
			runs = [];
			codeUnitIndex += cluster.length;

			continue;
		}

		const space = cluster === " ";
		const st = styleFor(entities, codeUnitIndex);
		const key = runKey(st, space);

		if (cur && key === curKey) cur.text += cluster;
		else {
			if (cur) runs.push(cur);

			cur = { ...st, text: cluster, space };
			curKey = key;
		}

		codeUnitIndex += cluster.length;
	}

	if (cur) runs.push(cur);
	paras.push(runs);

	return paras;
}

/** measured width of a run's text, in px, respecting per-grapheme display width (CJK/emoji ≈ 2x). */
const runW = (r: Run): number => {
	let units = 0;
	for (const g of graphemes(r.text)) units += clusterWidth(g);
	return units * (r.mono ? monoW : charW);
};

/** wrap styled runs into lines that fit `maxW` px. */
function wrapRuns(paras: Run[][], maxW: number): Run[][] {
	const lines: Run[][] = [];

	for (const para of paras) {
		// hard-break oversized non-space runs first — by grapheme cluster, so an emoji or a
		// surrogate pair never gets split across two lines.
		const toks: Run[] = [];

		for (const r of para) {
			if (r.space) {
				toks.push(r);
				continue;
			}

			const cw = r.mono ? monoW : charW;
			const clusters = graphemes(r.text);
			let i = 0;

			while (i < clusters.length) {
				let w = 0;
				let j = i;

				while (j < clusters.length) {
					const cwid = clusterWidth(clusters[j] ?? "") * cw;
					if (w + cwid > maxW && j > i) break;
					w += cwid;
					j++;
				}

				toks.push({ ...r, text: clusters.slice(i, j).join(""), space: false });
				i = j;
			}
		}

		let line: Run[] = [];
		let w = 0;

		for (const t of toks) {
			const tw = runW(t);

			if (!t.space && w + tw > maxW && line.length) {
				while (line.length && line[line.length - 1]?.space) line.pop();

				lines.push(line);
				line = [t];
				w = tw;
			} else {
				line.push(t);
				w += tw;
			}
		}

		lines.push(line);
	}

	return lines;
}

export function layoutText(
	text: string,
	entities: MessageEntity[],
	maxW: number,
	base: string,
	p: Palette,
): Block {
	const lines = wrapRuns(tokenize(text, entities), maxW);

	let w = 0;

	for (const ln of lines)
		w = Math.max(
			w,
			ln.reduce((a, r) => a + runW(r), 0),
		);

	const h = lines.length * LH;

	return {
		w: Math.ceil(w),
		h,
		render: (x, y) => {
			let out = "";
			lines.forEach((ln, li) => {
				// merge adjacent same-style runs so each styled span is one tspan
				const sig = (r: Run) =>
					`${r.b ? 1 : 0}${r.i ? 1 : 0}${r.u ? 1 : 0}${r.st ? 1 : 0}${r.mono ? 1 : 0}${r.spoiler ? 1 : 0}${r.link ? 1 : 0}`;

				const merged: Run[] = [];

				for (const r of ln) {
					const last = merged[merged.length - 1];

					if (last && sig(last) === sig(r)) last.text += r.text;
					else merged.push({ ...r });
				}

				let spans = "";
				for (const r of merged) {
					const shown = r.spoiler ? "█".repeat(graphemes(r.text).length) : esc(r.text);
					const a: string[] = [];
					const fill = r.spoiler ? p.meta : r.link ? p.link : r.mono ? p.code : base;

					a.push(`fill="${fill}"`);
					if (r.b) a.push(`font-weight="600"`);
					if (r.i) a.push(`font-style="italic"`);

					const deco = [r.u ? "underline" : "", r.st ? "line-through" : ""]
						.filter(Boolean)
						.join(" ");

					if (deco) a.push(`text-decoration="${deco}"`);
					if (r.mono) a.push(`font-family="${MONO}"`);

					spans += `<tspan ${a.join(" ")}>${shown}</tspan>`;
				}

				out += `<text x="${round(x)}" y="${round(y + li * LH + ASC)}" font-size="14" font-family="${FONT}">${spans}</text>`;
			});

			return out;
		},
	};
}

/** plain (unstyled) word-wrap for system-message pills and webpage-card descriptions. */
export function wrapPlainText(text: string, maxChars: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";

	for (const word of words) {
		if (!line) {
			line = word;
			continue;
		}

		if (line.length + 1 + word.length > maxChars) {
			lines.push(line);
			line = word;
		} else line += ` ${word}`;
	}

	if (line) lines.push(line);
	return lines.length ? lines : [text];
}
