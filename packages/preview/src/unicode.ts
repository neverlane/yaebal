/**
 * grapheme-cluster + display-width helpers. layoutText needs these so wrapping and hard-breaking
 * never split a surrogate pair or an emoji ZWJ sequence in half, and so CJK/emoji text is measured
 * at its real on-screen width instead of the latin-average estimate.
 */

const segmenter: { segment(input: string): Iterable<{ segment: string }> } | undefined =
	typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: undefined;

/** split text into user-perceived characters — never breaks a surrogate pair or a ZWJ sequence. */
export function graphemes(text: string): string[] {
	if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
	return Array.from(text); // Array.from already respects surrogate pairs (unlike string indexing)
}

// East-Asian Width "Wide"/"Fullwidth" ranges — a practical subset covering CJK, Hangul, kana,
// and fullwidth forms. not exhaustive (full EAW is a much larger table), but covers the scripts
// that actually show up in bot chat transcripts.
const WIDE_RANGES: [number, number][] = [
	[0x1100, 0x115f], // hangul jamo
	[0x2e80, 0x303e], // cjk radicals, kangxi, cjk symbols
	[0x3041, 0x33ff], // hiragana .. cjk compatibility
	[0x3400, 0x4dbf], // cjk extension a
	[0x4e00, 0x9fff], // cjk unified ideographs
	[0xa000, 0xa4cf], // yi
	[0xac00, 0xd7a3], // hangul syllables
	[0xf900, 0xfaff], // cjk compatibility ideographs
	[0xfe30, 0xfe4f], // cjk compatibility forms
	[0xff00, 0xff60], // fullwidth forms
	[0xffe0, 0xffe6],
	[0x20000, 0x3fffd], // cjk extension b and beyond
];

const EMOJI_RANGES: [number, number][] = [
	[0x1f1e6, 0x1f1ff], // regional indicators (flags)
	[0x1f300, 0x1fbff], // misc symbols/pictographs .. symbols & pictographs extended
	[0x2600, 0x27bf], // misc symbols, dingbats
];

function inRanges(cp: number, ranges: [number, number][]): boolean {
	for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
	return false;
}

const isCombining = (cp: number): boolean =>
	(cp >= 0x0300 && cp <= 0x036f) || cp === 0xfe0f || cp === 0x200d;

/** width of one grapheme cluster in "latin-char" units (1 = the base char cell, 2 = wide/emoji). */
export function clusterWidth(cluster: string): number {
	const cps = Array.from(cluster, (ch) => ch.codePointAt(0) ?? 0);
	const first = cps[0] ?? 0;

	// a cluster with more than one code point is a ZWJ/skin-tone/flag sequence — treat any
	// astral-plane member as evidence it's an emoji sequence, which renders as one wide glyph.
	if (cps.length > 1 && cps.some((cp) => cp >= 0x1f000)) return 2;
	if (inRanges(first, EMOJI_RANGES)) return 2;
	if (inRanges(first, WIDE_RANGES)) return 2;
	if (isCombining(first)) return 0;

	return 1;
}

/** total width of a string in "latin-char" units — sums per-grapheme, not per-code-unit. */
export function textWidthUnits(text: string): number {
	let w = 0;
	for (const g of graphemes(text)) w += clusterWidth(g);
	return w;
}

/** first grapheme of `name`, upper-cased if it's a letter — safe avatar/contact initial. */
export function initialOf(name: string): string {
	const g = graphemes(name)[0] ?? "";
	return /\p{L}/u.test(g) ? g.toUpperCase() : g;
}
