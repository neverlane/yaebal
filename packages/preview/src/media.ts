/** self-contained media blocks: pictures, audio/voice/document/contact cards, maps, polls, link-preview cards. */

import { clamp, esc, hash, round } from "./svg.js";
import type { Block } from "./text.js";
import { wrapPlainText } from "./text.js";
import type { Palette } from "./theme.js";
import { charW, FONT } from "./theme.js";
import type { LoosePoll } from "./types.js";
import { clusterWidth, graphemes, textWidthUnits } from "./unicode.js";

/** picture media (photo/video/animation) width — every bleed block shares this. */
export const MW = 252;

/** truncate `text` with an ellipsis so it fits `maxW` px at the given px-per-unit width — cuts
 * on grapheme-cluster boundaries so it never splits a surrogate pair or emoji sequence. */
export function ellipsize(text: string, maxW: number, unitW = charW): string {
	if (textWidthUnits(text) * unitW <= maxW) return text;

	const budget = Math.max(1, maxW / unitW - 1); // leave room for the ellipsis glyph
	let out = "";
	let w = 0;

	for (const g of graphemes(text)) {
		const cw = clusterWidth(g);
		if (w + cw > budget) break;
		out += g;
		w += cw;
	}

	return `${out}…`;
}

export function picture(
	src: string | undefined,
	natW: number | undefined,
	natH: number | undefined,
	clip: string,
	seedKey: string,
	spoiler: boolean,
	overlay: (x: number, y: number, w: number, h: number) => string,
): Block {
	const ar = natW && natH ? natH / natW : 0.62;
	const w = MW;
	const h = clamp(Math.round(w * ar), 120, 320);

	return {
		w,
		h,
		render: (x, y) => {
			let s = `<clipPath id="${clip}"><rect x="${round(x)}" y="${round(y)}" width="${w}" height="${h}" rx="14"/></clipPath><g clip-path="url(#${clip})">`;

			if (src && !spoiler)
				s += `<image href="${esc(src)}" x="${round(x)}" y="${round(y)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
			else {
				// no real pixels (a file_id has none) — paint a vivid, deterministic "photo" seeded
				// from the media's own identity (falls back to the clip id) so it never reads as an
				// empty grey box, and stays stable when messages are reordered.
				const seed = hash(seedKey);
				const h1 = seed % 360;
				const h2 = (h1 + 35 + (seed % 70)) % 360;

				s += `<linearGradient id="${clip}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 60% 60%)"/><stop offset="1" stop-color="hsl(${h2} 64% 42%)"/></linearGradient>`;
				s += `<rect x="${round(x)}" y="${round(y)}" width="${w}" height="${h}" fill="url(#${clip}g)"/>`;

				const cx = x + w / 2;
				const cy = y + h / 2;

				if (spoiler)
					s += `<text x="${round(cx)}" y="${round(cy + 8)}" font-size="24" text-anchor="middle">👁️‍🗨️</text>`;
				else
					s += `<path d="M${round(cx - 15)},${round(cy + 9)} l10,-13 l7,8 l4,-5 l8,11 z" fill="rgba(255,255,255,0.78)"/><circle cx="${round(cx + 9)}" cy="${round(cy - 8)}" r="4.5" fill="rgba(255,255,255,0.78)"/>`;
			}

			s += "</g>";
			s += overlay(x, y, w, h);

			return s;
		},
	};
}

export const playGlyph = (cx: number, cy: number): string =>
	`<circle cx="${round(cx)}" cy="${round(cy)}" r="22" fill="rgba(0,0,0,0.45)"/><path d="M${round(cx - 6)},${round(cy - 9)} l15,9 l-15,9 z" fill="#fff"/>`;

export const badge = (x: number, y: number, label: string): string =>
	`<rect x="${round(x + 8)}" y="${round(y + 8)}" width="${label.length * 7 + 12}" height="18" rx="9" fill="rgba(0,0,0,0.45)"/><text x="${round(x + 14)}" y="${round(y + 21)}" font-size="11" font-weight="600" fill="#fff" font-family="${FONT}">${esc(label)}</text>`;

export const durPill = (x: number, bottomY: number, text: string): string =>
	`<rect x="${round(x + 8)}" y="${round(bottomY - 26)}" width="${text.length * 6.5 + 12}" height="18" rx="9" fill="rgba(0,0,0,0.45)"/><text x="${round(x + 14)}" y="${round(bottomY - 13)}" font-size="11" font-weight="500" fill="#fff" font-family="${FONT}">${esc(text)}</text>`;

/** a 252-wide single-row card (audio/voice/document/contact). */
export function card(h: number, draw: (x: number, y: number) => string): Block {
	return { w: MW, h, render: (x, y) => draw(x, y) };
}

export function waveform(x: number, y: number, color: string, track: string): string {
	const heights = [5, 9, 14, 8, 16, 11, 6, 13, 9, 17, 7, 12, 10, 15, 6, 11, 8, 5];
	let s = "";

	heights.forEach((hh, i) => {
		const bx = x + i * 5;
		const col = i < 7 ? color : track;

		s += `<rect x="${round(bx)}" y="${round(y - hh / 2)}" width="2.4" height="${hh}" rx="1.2" fill="${col}"/>`;
	});

	return s;
}

export function mapTile(
	x: number,
	y: number,
	w: number,
	h: number,
	p: Palette,
	clip: string,
): string {
	let s = `<clipPath id="${clip}"><rect x="${round(x)}" y="${round(y)}" width="${w}" height="${h}" rx="14"/></clipPath><g clip-path="url(#${clip})">`;
	s += `<rect x="${round(x)}" y="${round(y)}" width="${w}" height="${h}" fill="${p.media}"/>`;

	for (let i = 1; i < 5; i++)
		s += `<line x1="${round(x)}" y1="${round(y + (i * h) / 5)}" x2="${round(x + w)}" y2="${round(y + (i * h) / 5)}" stroke="${p.media2}" stroke-width="6"/>`;

	s += `<line x1="${round(x + w * 0.55)}" y1="${round(y)}" x2="${round(x + w * 0.45)}" y2="${round(y + h)}" stroke="${p.media2}" stroke-width="8"/>`;

	const px = x + w / 2;
	const py = y + h / 2;

	s += `<path d="M${round(px)},${round(py - 14)} a8,8 0 0 1 8,8 c0,6 -8,14 -8,14 c0,0 -8,-8 -8,-14 a8,8 0 0 1 8,-8 z" fill="#e74c3c"/><circle cx="${round(px)}" cy="${round(py - 6)}" r="3" fill="#fff"/></g>`;

	return s;
}

/** poll question + options with percentage bars; shows a quiz/closed marker on the winning option. */
export function pollBlock(poll: LoosePoll, w: number, base: string, p: Palette): Block {
	const opts = poll.options;
	const total = Math.max(
		1,
		poll.total_voter_count || opts.reduce((a, o) => a + (o.voter_count ?? 0), 0),
	);
	const rowH = 34;
	const h = 26 + opts.length * rowH + 16;
	const closed = poll.is_closed;
	const isQuiz = poll.type === "quiz";

	return {
		w,
		h,
		render: (x, y) => {
			let s = `<text x="${round(x)}" y="${round(y + 15)}" font-size="14" font-weight="600" fill="${base}" font-family="${FONT}">${esc(poll.question ?? "")}</text>`;

			const kind = closed
				? "Final results"
				: isQuiz
					? "Quiz"
					: poll.is_anonymous === false
						? "Public"
						: "Anonymous";
			s += `<text x="${round(x + w)}" y="${round(y + 15)}" font-size="11" fill="${p.meta}" font-family="${FONT}" text-anchor="end">${esc(kind)}</text>`;

			// round each option down, then hand the leftover percentage points to the largest
			// remainders so the row always reads a clean 100% total (not e.g. 33/33/33).
			const raw = opts.map((o) => ((o.voter_count ?? 0) / total) * 100);
			const pct = raw.map(Math.floor);
			let leftover = 100 - pct.reduce((a, b) => a + b, 0);

			raw
				.map((v, i) => ({ i, frac: v - Math.floor(v) }))
				.sort((a, b) => b.frac - a.frac)
				.forEach(({ i }) => {
					if (leftover <= 0) return;
					pct[i] = (pct[i] ?? 0) + 1;
					leftover--;
				});

			opts.forEach((o, i) => {
				const oy = y + 26 + i * rowH;
				const p_ = pct[i] ?? 0;
				const winning = (closed || isQuiz) && (o.voter_count ?? 0) > 0 && p_ === Math.max(...pct);

				s += `<text x="${round(x)}" y="${round(oy + 12)}" font-size="13" fill="${base}" font-family="${FONT}">${esc(ellipsize(o.text ?? "", w - 40))}</text>`;
				if (winning)
					s += `<text x="${round(x + w - 22)}" y="${round(oy + 13)}" font-size="12" fill="${p.tick}">✓</text>`;
				s += `<text x="${round(x + w)}" y="${round(oy + 12)}" font-size="12" fill="${p.meta}" text-anchor="end" font-family="${FONT}">${p_}%</text>`;
				s += `<rect x="${round(x)}" y="${round(oy + 18)}" width="${round(w)}" height="4" rx="2" fill="${p.barTrack}"/>`;
				s += `<rect x="${round(x)}" y="${round(oy + 18)}" width="${round((w * p_) / 100)}" height="4" rx="2" fill="${p.bar}"/>`;
			});

			return s;
		},
	};
}

/** link-preview card — a left accent bar + site/title/description, like telegram's own webpage preview. */
export function webpageBlock(
	site: string | undefined,
	title: string | undefined,
	description: string | undefined,
	src: string | undefined,
	w: number,
	base: string,
	p: Palette,
): Block {
	const innerW = w - 12;
	const descLines = description
		? wrapPlainText(description, Math.max(10, Math.floor(innerW / 6.2))).slice(0, 3)
		: [];
	const thumb = src ? 56 : 0;
	const textW = innerW - (thumb ? thumb + 8 : 0);

	const siteH = site ? 15 : 0;
	const titleH = title ? 17 : 0;
	const descH = descLines.length * 15;
	const contentH = siteH + titleH + descH;
	const h = Math.max(contentH, thumb) + 4;

	return {
		w,
		h,
		render: (x, y) => {
			let s = `<rect x="${round(x)}" y="${round(y)}" width="3" height="${round(h)}" rx="1.5" fill="${p.link}"/>`;

			let ty = y;
			if (site) {
				s += `<text x="${round(x + 10)}" y="${round(ty + 12)}" font-size="12" font-weight="600" fill="${p.link}" font-family="${FONT}">${esc(ellipsize(site, textW))}</text>`;
				ty += siteH;
			}
			if (title) {
				s += `<text x="${round(x + 10)}" y="${round(ty + 13)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(ellipsize(title, textW))}</text>`;
				ty += titleH;
			}
			descLines.forEach((line, i) => {
				s += `<text x="${round(x + 10)}" y="${round(ty + 11 + i * 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(line)}</text>`;
			});

			if (thumb) {
				const tx = x + w - thumb;
				const clip = `wp${Math.abs(hash(src ?? "")) % 100000}`;
				s += `<clipPath id="${clip}"><rect x="${round(tx)}" y="${round(y)}" width="${thumb}" height="${thumb}" rx="8"/></clipPath><image href="${esc(src ?? "")}" x="${round(tx)}" y="${round(y)}" width="${thumb}" height="${thumb}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`;
			}

			return s;
		},
	};
}
