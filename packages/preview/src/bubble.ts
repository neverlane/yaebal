/** bubble decorations: reply quotes, forwarded headers, reaction pills, and message grouping. */

import { esc, hash, round } from "./svg.js";
import type { Block } from "./text.js";
import { layoutText } from "./text.js";
import type { Palette } from "./theme.js";
import { AVATAR_COLORS, charW, FONT, LH } from "./theme.js";
import type { ChatMessage, ForwardHeader, Reaction, ReplyQuote } from "./types.js";
import { textWidthUnits } from "./unicode.js";

/** telegram groups consecutive same-sender messages: only the last bubble gets the tail + avatar, only the first shows the name label, and the vertical gap between them shrinks. */
export interface GroupInfo {
	first: boolean;
	last: boolean;
}

export function computeGroups(messages: ChatMessage[]): GroupInfo[] {
	return messages.map((m, i) => {
		if (m.from === "system") return { first: true, last: true };

		const prev = messages[i - 1];
		const next = messages[i + 1];

		const samePrev = !!prev && prev.from === m.from && (prev.name ?? "") === (m.name ?? "");
		const sameNext = !!next && next.from === m.from && (next.name ?? "") === (m.name ?? "");

		return { first: !samePrev, last: !sameNext };
	});
}

const MEDIA_LABEL: Record<NonNullable<ReplyQuote["media"]>, string> = {
	photo: "📷 Photo",
	video: "📹 Video",
	voice: "🎤 Voice message",
	audio: "🎵 Audio",
	document: "📄 Document",
	sticker: "Sticker",
	poll: "📊 Poll",
	location: "📍 Location",
	contact: "👤 Contact",
};

/** the reply-to quote block — a coloured accent bar + quoted name/text, rendered above the content. */
export function replyBlock(reply: ReplyQuote, maxW: number, p: Palette): Block {
	const accent =
		reply.accent ?? AVATAR_COLORS[hash(reply.name ?? "") % AVATAR_COLORS.length] ?? p.link;
	const nameH = reply.name ? 15 : 0;
	const snippet = reply.text ?? (reply.media ? MEDIA_LABEL[reply.media] : undefined);
	const textBlock = snippet
		? layoutText(snippet, reply.text ? (reply.entities ?? []) : [], maxW - 10, p.meta, p)
		: undefined;
	const h = 6 + nameH + (textBlock?.h ?? 13) + 6;

	return {
		w: maxW,
		h,
		render: (x, y) => {
			let s = `<rect x="${round(x)}" y="${round(y)}" width="3" height="${round(h)}" rx="1.5" fill="${accent}"/>`;
			let cy = y + 6;

			if (reply.name) {
				s += `<text x="${round(x + 10)}" y="${round(cy + 11)}" font-size="12.5" font-weight="600" fill="${accent}" font-family="${FONT}">${esc(reply.name)}</text>`;
				cy += nameH;
			}

			if (textBlock) s += textBlock.render(x + 10, cy);

			return s;
		},
	};
}

const FORWARD_PREFIX = "Forwarded from ";

/** the "Forwarded from …" header line, rendered above the content. */
export function forwardBlock(fwd: ForwardHeader, p: Palette): Block {
	// the header must report its real rendered width — an unreported (zero) width let the bubble
	// shrink-wrap smaller than this text and left it overflowing past the bubble's right edge,
	// colliding with the time/id meta drawn at that (too-narrow) edge.
	const prefixW = FORWARD_PREFIX.length * 6.6;
	const w = Math.ceil(prefixW + textWidthUnits(fwd.from) * charW);

	return {
		w,
		h: LH,
		render: (x, y) => {
			return (
				`<text x="${round(x)}" y="${round(y + 13)}" font-size="12.5" font-style="italic" fill="${p.meta}" font-family="${FONT}">${esc(FORWARD_PREFIX)}</text>` +
				`<text x="${round(x + prefixW)}" y="${round(y + 13)}" font-size="12.5" font-weight="600" fill="${p.name}" font-family="${FONT}">${esc(fwd.from)}</text>`
			);
		},
	};
}

// reserved emoji column + a real gap before the count, so a wide emoji glyph and a multi-digit
// count never overlap (a plain char-count budget is too tight for emoji, which render wider than
// their font-size implies)
const EMOJI_COL = 20;
const COUNT_GAP = 6;
const reactionPillWidth = (r: Reaction): number =>
	12 + EMOJI_COL + COUNT_GAP + `${r.count}`.length * 7 + 12;

/** a row of reaction pills under the bubble; `chosen` reactions render filled in the accent colour. */
export function reactionsRow(
	x: number,
	y: number,
	reactions: Reaction[],
	p: Palette,
): { s: string; h: number } {
	const H = 24;
	let cx = x;
	let s = "";

	for (const r of reactions) {
		const w = reactionPillWidth(r);
		const filled = !!r.chosen;

		s += `<rect x="${round(cx)}" y="${round(y)}" width="${round(w)}" height="${H}" rx="12" fill="${filled ? p.link : p.button}" stroke="${filled ? "none" : p.buttonStroke}"/>`;
		s += `<text x="${round(cx + 12)}" y="${round(y + 16)}" font-size="13">${esc(r.emoji)}</text>`;
		s += `<text x="${round(cx + w - 12)}" y="${round(y + 16)}" font-size="12" font-weight="600" fill="${filled ? "#fff" : p.buttonText}" text-anchor="end" font-family="${FONT}">${r.count}</text>`;

		cx += w + 6;
	}

	return { s, h: reactions.length ? H : 0 };
}
