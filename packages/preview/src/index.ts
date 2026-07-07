/**
 * @yaebal/preview — render a telegram-style chat from plain objects to an SVG string.
 * zero runtime, no `<foreignObject>` (so it rasterizes and survives github's SVG
 * sanitizer). media fields use the real `@yaebal/types` shapes, so you can hand it a
 * `ctx.message` almost verbatim; add `src` to show real pixels (a `file_id` has none).
 *
 *   import { renderChat } from "@yaebal/preview";
 *   import { md } from "@yaebal/fmt";
 *
 *   renderChat([
 *     { from: "user", text: "/start", time: "23:33", status: "read" },
 *     { from: "bot", name: "yaebal", ...md`hello, **unknown** person`, time: "23:33" },
 *     { from: "bot", name: "yaebal", photo: [], src: "cat.jpg", caption: "a cat" },
 *     { from: "bot", name: "yaebal", voice: { duration: 7 } },
 *     { from: "bot", name: "yaebal", poll: { question: "tabs?", options: [...] } },
 *   ], { theme: "light" });
 */

import type {
	Animation,
	Audio,
	Contact,
	Document,
	Location,
	MessageEntity,
	PhotoSize,
	Poll,
	Sticker,
	Venue,
	Video,
	Voice,
} from "@yaebal/types";

export type Side = "user" | "bot" | "system";
export type TickStatus = "sent" | "delivered" | "read";

export interface ChatMessage {
	from: Side;
	/** sender label (incoming); also drives the avatar initial + colour. */
	name?: string;
	time?: string;
	/** outgoing read receipt (ticks). ignored for incoming. */
	status?: TickStatus;
	/** keyboard rows rendered as buttons under the message. */
	buttons?: string[][];
	/** rendered as compact diagnostic text above the bubble. */
	debug?: string | string[];
	/** rendered in the time/meta slot when `time` is not provided. */
	messageId?: string | number;

	/** message text. spread `@yaebal/fmt`'s `md`/`html` to also pass `entities`. */
	text?: string;
	/** telegram entities for `text` (bold/italic/code/link/spoiler/…). */
	entities?: MessageEntity[];
	/** caption for a media message. */
	caption?: string;
	/** telegram entities for `caption`. */
	captionEntities?: MessageEntity[];

	/** real image/thumb URL or data-URI for the picture-like media below (a `file_id` can't render). */
	src?: string;
	/** cover the media with a spoiler. */
	spoiler?: boolean;

	// media — real @yaebal/types shapes (the array/objects you'd get off an Update)
	photo?: PhotoSize[];
	sticker?: Sticker;
	animation?: Animation;
	video?: Video;
	voice?: Voice;
	audio?: Audio;
	document?: Document;
	venue?: Venue;
	location?: Location;
	contact?: Contact;
	poll?: Poll;
}

function wrapPlainText(text: string, maxChars: number): string[] {
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

export interface RenderOptions {
	/** default `"light"` (the green-wallpaper look). */
	theme?: "dark" | "light";
	/** canvas width in px. defaults to `380`. */
	width?: number;
	/** override the avatar glyph for incoming messages (else the name's initial). */
	avatar?: string;
}

interface Palette {
	bg0: string;
	bg1: string;
	out: string;
	outText: string;
	in: string;
	inText: string;
	meta: string;
	tick: string;
	link: string;
	name: string;
	code: string;
	media: string;
	media2: string;
	bar: string;
	barTrack: string;
	scrim: string;
	button: string;
	buttonText: string;
	buttonStroke: string;
	cardLine: string;
}

const PALETTES: Record<"dark" | "light", Palette> = {
	light: {
		bg0: "#d8e8c7",
		bg1: "#c2dcae",
		out: "#e4f7d2",
		outText: "#0c1f0c",
		in: "#ffffff",
		inText: "#0b1320",
		meta: "#8aa18c",
		tick: "#54b757",
		link: "#3a8fd6",
		name: "#3a8fd6",
		code: "#bb4d3a",
		media: "#c4d0d9",
		media2: "#aebccb",
		bar: "#54a0e0",
		barTrack: "rgba(0,0,0,0.08)",
		scrim: "rgba(0,0,0,0.4)",
		button: "#ffffff",
		buttonText: "#3a8fd6",
		buttonStroke: "rgba(0,0,0,0.06)",
		cardLine: "rgba(0,0,0,0.08)",
	},
	dark: {
		bg0: "#0e1621",
		bg1: "#1a2733",
		out: "#2b5278",
		outText: "#ffffff",
		in: "#182533",
		inText: "#ffffff",
		meta: "#7d8e9e",
		tick: "#64b5f6",
		link: "#6ab3f3",
		name: "#6ab3f3",
		code: "#e2a07a",
		media: "#2a3744",
		media2: "#1f2a35",
		bar: "#5fa8dd",
		barTrack: "rgba(255,255,255,0.1)",
		scrim: "rgba(0,0,0,0.45)",
		button: "#17212b",
		buttonText: "#7da6c9",
		buttonStroke: "rgba(255,255,255,0.06)",
		cardLine: "rgba(255,255,255,0.08)",
	},
};

const AVATAR_COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c] ?? c);
const hash = (s: string): number => {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
};

const round = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const dur = (s?: number): string => {
	const n = Math.max(0, Math.round(s ?? 0));

	return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

// layout constants
const FS = 14;
const LH = 19;
const ASC = 13;
const PADX = 11;
const PADY = 7;
const charW = FS * 0.54;
const monoW = FS * 0.6;

/** a positioned, self-sizing chunk of content. */
interface Block {
	w: number;
	h: number;
	render: (x: number, y: number) => string;
}

interface Run {
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

function tokenize(text: string, entities: MessageEntity[]): Run[][] {
	const paras: Run[][] = [];

	let runs: Run[] = [];
	let cur: Run | null = null;
	let curKey = "";

	for (let i = 0; i < text.length; i++) {
		const ch = text[i] ?? "";

		if (ch === "\n") {
			if (cur) runs.push(cur);

			cur = null;
			curKey = "";
			paras.push(runs);
			runs = [];

			continue;
		}

		const space = ch === " ";
		const st = styleFor(entities, i);
		const key = runKey(st, space);

		if (cur && key === curKey) cur.text += ch;
		else {
			if (cur) runs.push(cur);

			cur = { ...st, text: ch, space };
			curKey = key;
		}
	}

	if (cur) runs.push(cur);
	paras.push(runs);

	return paras;
}

const runW = (r: Run): number => r.text.length * (r.mono ? monoW : charW);

/** wrap styled runs into lines that fit `maxW` px. */
function wrapRuns(paras: Run[][], maxW: number): Run[][] {
	const lines: Run[][] = [];

	for (const para of paras) {
		// hard-break oversized non-space runs first
		const toks: Run[] = [];

		for (const r of para) {
			if (r.space) {
				toks.push(r);
				continue;
			}

			let t = r.text;
			const cw = r.mono ? monoW : charW;
			const max = Math.max(1, Math.floor(maxW / cw));

			while (t.length > max) {
				toks.push({ ...r, text: t.slice(0, max), space: false });
				t = t.slice(max);
			}

			toks.push({ ...r, text: t, space: false });
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

function layoutText(
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
					const shown = r.spoiler ? "█".repeat(r.text.length) : esc(r.text);
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

				out += `<text x="${round(x)}" y="${round(y + li * LH + ASC)}" font-size="${FS}" font-family="${FONT}">${spans}</text>`;
			});

			return out;
		},
	};
}

function rr(
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

function ticks(x: number, y: number, status: TickStatus, color: string): string {
	// telegram proportions: short down-stroke into a vertex, longer up-stroke; the
	// double tick offsets the second check by ~half its width so both read clearly.
	const one = (ox: number) =>
		`<path d="M${round(ox)},${round(y)} l2.3,2.6 l5.6,-6.4" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;

	return status === "sent" ? one(x + 3) : one(x) + one(x + 4.6);
}

/** time + ticks at a right edge; `scrim` draws a dark pill (over media). */
function meta(
	rightX: number,
	bottomY: number,
	time: string,
	status: TickStatus | undefined,
	out: boolean,
	p: Palette,
	scrim: boolean,
): string {
	if (!time && !status) return "";

	const tickW = out && status ? 15 : 0;
	const tw = time.length * (11 * 0.55);

	let s = "";
	const color = scrim ? "#fff" : p.meta;

	if (scrim) {
		const pw = tw + tickW + 16;

		s += `<rect x="${round(rightX - pw)}" y="${round(bottomY - 17)}" width="${round(pw)}" height="18" rx="9" fill="${p.scrim}"/>`;
	}

	if (time)
		s += `<text x="${round(rightX - tickW)}" y="${round(bottomY - 4)}" font-size="11" fill="${color}" text-anchor="end" font-family="${FONT}">${esc(time)}</text>`;

	if (out && status)
		s += ticks(round(rightX - 12), round(bottomY - 5), status, scrim ? "#fff" : p.tick);

	return s;
}

const MW = 252; // picture media width

function picture(
	src: string | undefined,
	natW: number | undefined,
	natH: number | undefined,
	_p: Palette,
	clip: string,
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
				// no real pixels (a file_id has none) — paint a vivid, deterministic
				// "photo" so media never reads as an empty grey box.
				const seed = hash(clip);
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

const playGlyph = (cx: number, cy: number): string =>
	`<circle cx="${round(cx)}" cy="${round(cy)}" r="22" fill="rgba(0,0,0,0.45)"/><path d="M${round(cx - 6)},${round(cy - 9)} l15,9 l-15,9 z" fill="#fff"/>`;

const badge = (x: number, y: number, label: string): string =>
	`<rect x="${round(x + 8)}" y="${round(y + 8)}" width="${label.length * 7 + 12}" height="18" rx="9" fill="rgba(0,0,0,0.45)"/><text x="${round(x + 14)}" y="${round(y + 21)}" font-size="11" font-weight="600" fill="#fff" font-family="${FONT}">${esc(label)}</text>`;

const durPill = (x: number, bottomY: number, text: string): string =>
	`<rect x="${round(x + 8)}" y="${round(bottomY - 26)}" width="${text.length * 6.5 + 12}" height="18" rx="9" fill="rgba(0,0,0,0.45)"/><text x="${round(x + 14)}" y="${round(bottomY - 13)}" font-size="11" font-weight="500" fill="#fff" font-family="${FONT}">${esc(text)}</text>`;

/** a 252-wide single-row card (audio/voice/document/contact). */
function card(
	_p: Palette,
	_base: string,
	h: number,
	draw: (x: number, y: number) => string,
): Block {
	return { w: MW, h, render: (x, y) => draw(x, y) };
}

function waveform(x: number, y: number, color: string, track: string): string {
	const heights = [5, 9, 14, 8, 16, 11, 6, 13, 9, 17, 7, 12, 10, 15, 6, 11, 8, 5];
	let s = "";

	heights.forEach((hh, i) => {
		const bx = x + i * 5;
		const col = i < 7 ? color : track;

		s += `<rect x="${round(bx)}" y="${round(y - hh / 2)}" width="2.4" height="${hh}" rx="1.2" fill="${col}"/>`;
	});

	return s;
}

function mapTile(x: number, y: number, w: number, h: number, p: Palette, clip: string): string {
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

/** render a telegram-style chat to an SVG string. */
export function renderChat(messages: ChatMessage[], options: RenderOptions = {}): string {
	const W = Math.max(240, Math.round(options.width ?? 380));
	const p = PALETTES[options.theme === "dark" ? "dark" : "light"];
	const PAD = 14;
	const GAP = 10;
	const AV = 30;
	const AVGAP = 8;
	const RAD = 16;
	const TAIL = 5;
	const BTN_H = 34;
	const BTN_GAP = 4;
	const maxBubbleW = Math.round(W * 0.76);
	const body: string[] = [];

	let clipN = 0;
	let y = PAD;

	for (const m of messages) {
		// every rendered message is wrapped in <g class="yb-msg"> so consumers can
		// target messages individually (e.g. the docs playground animates them in)
		const msgStart = body.length;
		const wrapMessage = () => {
			if (body.length === msgStart) return;
			body.splice(msgStart, 0, `<g class="yb-msg">`);
			body.push("</g>");
		};

		const out = m.from === "user";
		const indent = out ? 0 : AV + AVGAP;
		const base = out ? p.outText : p.inText;
		const time = m.time ?? (m.messageId === undefined ? "" : `#${m.messageId}`);

		if (m.from === "system") {
			const text = m.text ?? "";
			if (!text) continue;

			const maxW = W - PAD * 4;
			const lines = wrapPlainText(text, Math.max(18, Math.floor(maxW / 6.2)));
			const textW = Math.max(...lines.map((line) => line.length * 6.2));
			const bw = clamp(textW + 22, 80, W - PAD * 2);
			const bh = lines.length * 15 + 10;
			const bx = (W - bw) / 2;

			body.push(
				`<rect x="${round(bx)}" y="${round(y)}" width="${round(bw)}" height="${round(bh)}" rx="${round(bh / 2)}" fill="${p.button}" stroke="${p.buttonStroke}"/>`,
			);
			lines.forEach((line, i) => {
				body.push(
					`<text x="${round(W / 2)}" y="${round(y + 18 + i * 15)}" font-size="12" fill="${p.meta}" text-anchor="middle" font-family="${FONT}">${esc(line)}</text>`,
				);
			});
			y += bh + GAP;

			wrapMessage();
			continue;
		}

		// sticker = standalone, no bubble
		if (m.sticker) {
			const sz = 116;
			const sx = out ? W - PAD - sz : PAD + indent;

			if (m.src) {
				const c = `c${clipN++}`;

				body.push(
					`<clipPath id="${c}"><rect x="${round(sx)}" y="${round(y)}" width="${sz}" height="${sz}" rx="10"/></clipPath><image href="${esc(m.src)}" x="${round(sx)}" y="${round(y)}" width="${sz}" height="${sz}" clip-path="url(#${c})" preserveAspectRatio="xMidYMid meet"/>`,
				);
			} else {
				body.push(
					`<text x="${round(sx + sz / 2)}" y="${round(y + sz / 2 + 30)}" font-size="84" text-anchor="middle">${esc(m.sticker.emoji ?? "🎈")}</text>`,
				);
			}

			body.push(meta(out ? W - PAD : sx + sz, y + sz, time, m.status, out, p, false));
			y += sz + GAP;

			wrapMessage();
			continue;
		}

		// build content blocks
		const blocks: { block: Block; bleed: boolean }[] = [];
		const pic = (
			natW?: number,
			natH?: number,
			ov?: (x: number, y: number, w: number, h: number) => string,
		) => picture(m.src, natW, natH, p, `c${clipN++}`, !!m.spoiler, ov ?? (() => ""));

		if (m.photo)
			blocks.push({ block: pic(m.photo.at(-1)?.width, m.photo.at(-1)?.height), bleed: true });
		else if (m.animation)
			blocks.push({
				block: pic(m.animation.width, m.animation.height, (x, y2, _w) => badge(x, y2, "GIF")),
				bleed: true,
			});
		else if (m.video)
			blocks.push({
				block: pic(
					m.video.width,
					m.video.height,
					(x, y2, w, h) =>
						playGlyph(x + w / 2, y2 + h / 2) + durPill(x, y2 + h, dur(m.video?.duration)),
				),
				bleed: true,
			});
		else if (m.location) {
			const h = 132;

			blocks.push({
				block: { w: MW, h, render: (x, y2) => mapTile(x, y2, MW, h, p, `c${clipN++}`) },
				bleed: true,
			});
		} else if (m.venue) {
			const mh = 120;
			const v = m.venue;

			blocks.push({
				block: {
					w: MW,
					h: mh + 44,
					render: (x, y2) => {
						let s = mapTile(x, y2, MW, mh, p, `c${clipN++}`);

						s += `<text x="${round(x)}" y="${round(y2 + mh + 17)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(v.title)}</text>`;
						s += `<text x="${round(x)}" y="${round(y2 + mh + 35)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(v.address)}</text>`;

						return s;
					},
				},
				bleed: true,
			});
		}

		if (m.voice) {
			const d = m.voice.duration;

			blocks.push({
				block: card(p, base, 40, (x, y2) => {
					const cy = y2 + 20;

					return `<circle cx="${round(x + 18)}" cy="${round(cy)}" r="18" fill="${p.bar}"/><path d="M${round(x + 14)},${round(cy - 7)} l9,7 l-9,7 z" fill="#fff"/>${waveform(x + 44, cy, p.bar, p.barTrack)}<text x="${round(x + 44)}" y="${round(cy + 18)}" font-size="11" fill="${p.meta}" font-family="${FONT}">${dur(d)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.audio) {
			const a = m.audio;

			blocks.push({
				block: card(p, base, 44, (x, y2) => {
					const cy = y2 + 22;
					const title = a.title ?? a.file_name ?? "audio";
					const sub = a.performer ?? dur(a.duration);

					return `<circle cx="${round(x + 22)}" cy="${round(cy)}" r="22" fill="${p.bar}"/><path d="M${round(x + 17)},${round(cy - 9)} l13,9 l-13,9 z" fill="#fff"/><text x="${round(x + 54)}" y="${round(cy - 2)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(title)}</text><text x="${round(x + 54)}" y="${round(cy + 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(sub)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.document) {
			const d = m.document;
			const kb = d.file_size
				? `${Math.max(1, Math.round(d.file_size / 1024))} KB`
				: (d.mime_type ?? "file");

			blocks.push({
				block: card(p, base, 44, (x, y2) => {
					const cy = y2 + 22;

					return `<rect x="${round(x)}" y="${round(y2)}" width="44" height="44" rx="12" fill="${p.bar}"/><path d="M${round(x + 14)},${round(cy - 11)} h11 l5,5 v17 h-16 z" fill="rgba(255,255,255,0.9)"/><text x="${round(x + 54)}" y="${round(cy - 2)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(d.file_name ?? "document")}</text><text x="${round(x + 54)}" y="${round(cy + 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(kb)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.contact) {
			const c = m.contact;
			const nm = `${c.first_name}${c.last_name ? ` ${c.last_name}` : ""}`;
			const col = AVATAR_COLORS[hash(nm) % AVATAR_COLORS.length] ?? "#65aadd";

			blocks.push({
				block: card(p, base, 44, (x, y2) => {
					const cy = y2 + 22;

					return `<circle cx="${round(x + 22)}" cy="${round(cy)}" r="22" fill="${col}"/><text x="${round(x + 22)}" y="${round(cy + 6)}" font-size="17" font-weight="600" fill="#fff" text-anchor="middle" font-family="${FONT}">${esc(nm[0]?.toUpperCase() ?? "?")}</text><text x="${round(x + 54)}" y="${round(cy - 2)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(nm)}</text><text x="${round(x + 54)}" y="${round(cy + 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(c.phone_number)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.poll) {
			const poll = m.poll;

			const total = Math.max(
				1,
				poll.total_voter_count || poll.options.reduce((a, o) => a + o.voter_count, 0),
			);

			const opts = poll.options;
			const rowH = 34;
			const h = 26 + opts.length * rowH + 16;

			blocks.push({
				block: {
					w: maxBubbleW - PADX * 2,
					h,
					render: (x, y2) => {
						const w = maxBubbleW - PADX * 2;
						let s = `<text x="${round(x)}" y="${round(y2 + 15)}" font-size="14" font-weight="600" fill="${base}" font-family="${FONT}">${esc(poll.question)}</text>`;

						s += `<text x="${round(x)}" y="${round(y2 + 15)}" dx="0" font-size="11" fill="${p.meta}" font-family="${FONT}" text-anchor="end" transform="translate(${round(w)},0)">${poll.is_anonymous === false ? "Public" : "Anonymous"}</text>`;

						opts.forEach((o, i) => {
							const oy = y2 + 26 + i * rowH;
							const pct = Math.round((o.voter_count / total) * 100);
							s += `<text x="${round(x)}" y="${round(oy + 12)}" font-size="13" fill="${base}" font-family="${FONT}">${esc(o.text)}</text>`;
							s += `<text x="${round(x + w)}" y="${round(oy + 12)}" font-size="12" fill="${p.meta}" text-anchor="end" font-family="${FONT}">${pct}%</text>`;
							s += `<rect x="${round(x)}" y="${round(oy + 18)}" width="${round(w)}" height="4" rx="2" fill="${p.barTrack}"/>`;
							s += `<rect x="${round(x)}" y="${round(oy + 18)}" width="${round((w * pct) / 100)}" height="4" rx="2" fill="${p.bar}"/>`;
						});

						return s;
					},
				},
				bleed: false,
			});
		}

		const hasBleed = blocks.some((b) => b.bleed);

		// text/caption
		const tText = m.text ?? "";
		const cText = m.caption ?? "";
		const ents = m.entities ?? [];
		const cEnts = m.captionEntities ?? [];
		const innerMax = hasBleed || blocks.length ? MW - PADX * 2 : maxBubbleW - PADX * 2;

		if (tText)
			blocks.push({
				block: layoutText(tText, ents, blocks.length ? innerMax : maxBubbleW - PADX * 2, base, p),
				bleed: false,
			});

		if (cText) blocks.push({ block: layoutText(cText, cEnts, innerMax, base, p), bleed: false });

		if (!blocks.length && !m.buttons?.length) {
			y += GAP;
			continue;
		}

		let bubbleW = 0;
		if (blocks.length) {
			// bubble width: bleed media → media width; else widest padded block
			const bleedW = hasBleed ? MW : 0;
			const padW =
				Math.max(0, ...blocks.filter((b) => !b.bleed).map((b) => b.block.w)) +
				(blocks.some((b) => !b.bleed) ? PADX * 2 : 0);

			const lastIsText = !blocks[blocks.length - 1]?.bleed && (!!tText || !!cText);
			const metaInline = lastIsText
				? time
					? time.length * 6 + (out && m.status ? 16 : 0) + 8
					: 0
				: 0;

			bubbleW = Math.max(bleedW, padW);

			if (lastIsText) {
				const lastW = blocks[blocks.length - 1]?.block.w ?? 0;

				bubbleW = Math.max(bubbleW, Math.min(maxBubbleW, lastW + PADX * 2 + metaInline));
			}

			bubbleW = clamp(bubbleW, 60, maxBubbleW);

			// an inline keyboard spans at least media width — widen the bubble to match,
			// so the bubble and its keyboard sit flush like one telegram message
			if (m.buttons?.length) bubbleW = clamp(Math.max(bubbleW, MW), 60, maxBubbleW);

			// stack height
			let inner = 0;

			blocks.forEach((b, i) => {
				inner += b.block.h;
				if (i < blocks.length - 1) inner += b.bleed && !blocks[i + 1]?.bleed ? PADY : 6;
			});

			// name sits on its own row above the first non-bleed block — count its height
			const nameH = !out && m.name && !blocks[0]?.bleed ? LH : 0;
			const padTop = blocks[0]?.bleed ? 0 : PADY;
			const padBot = lastIsText ? PADY : blocks[blocks.length - 1]?.bleed ? 0 : PADY;
			const bubbleH = padTop + nameH + inner + padBot;

			const debugLines = [m.debug].flat().filter((line): line is string => !!line);
			const debugH = debugLines.length ? debugLines.length * 14 + 4 : 0;
			const bx = out ? W - PAD - bubbleW : PAD + indent;
			const by = y + debugH;

			if (debugLines.length) {
				const tx = out ? bx + bubbleW : bx;
				const anchor = out ? "end" : "start";

				debugLines.forEach((line, i) => {
					body.push(
						`<text x="${round(tx)}" y="${round(y + 11 + i * 14)}" font-size="11" fill="${p.meta}" text-anchor="${anchor}" font-family="${MONO}">${esc(line)}</text>`,
					);
				});
			}

			const path = out
				? rr(bx, by, bubbleW, bubbleH, RAD, RAD, TAIL, RAD)
				: rr(bx, by, bubbleW, bubbleH, RAD, RAD, RAD, TAIL);

			body.push(`<path d="${path}" fill="${out ? p.out : p.in}"/>`);

			// avatar
			if (!out) {
				const who = m.name ?? "";
				const glyph = options.avatar ?? (who ? who[0]?.toUpperCase() : undefined) ?? "🤖";
				const ac = AVATAR_COLORS[hash(who || "bot") % AVATAR_COLORS.length] ?? "#7bc862";
				const cy = by + bubbleH - AV / 2;

				body.push(
					`<circle cx="${round(PAD + AV / 2)}" cy="${round(cy)}" r="${AV / 2}" fill="${ac}"/><text x="${round(PAD + AV / 2)}" y="${round(cy + 5)}" font-size="14" font-weight="600" fill="#fff" text-anchor="middle" font-family="${FONT}">${esc(glyph)}</text>`,
				);
			}

			// name (incoming, above first padded block)
			let cursor = by + padTop;
			if (!out && m.name && !blocks[0]?.bleed) {
				body.push(
					`<text x="${round(bx + PADX)}" y="${round(cursor + 13)}" font-size="13" font-weight="600" fill="${p.name}" font-family="${FONT}">${esc(m.name)}</text>`,
				);

				cursor += LH;
			}

			// blocks
			blocks.forEach((b, i) => {
				const bxr = b.bleed ? bx : bx + PADX;

				body.push(b.block.render(bxr, cursor));
				cursor += b.block.h;

				if (i < blocks.length - 1) cursor += b.bleed && !blocks[i + 1]?.bleed ? PADY : 6;
			});

			// meta
			const onScrim = !lastIsText && hasBleed;
			const metaRight = onScrim ? bx + bubbleW - 8 : bx + bubbleW - PADX;
			// sit time/ticks on the last text line's baseline (bubble bottom − padBot − descent)
			const metaBottom = onScrim
				? by + (blocks[0]?.block.h ?? bubbleH)
				: by + bubbleH - padBot - (LH - ASC) + 4;

			body.push(meta(metaRight, metaBottom, time, m.status, out, p, onScrim));

			y = by + bubbleH;
		}

		// buttons
		if (m.buttons?.length) {
			let byy = blocks.length ? y + 6 : y;

			const rowW = Math.max(bubbleW, MW);
			const bxx = out ? W - PAD - rowW : PAD + indent;

			for (const row of m.buttons) {
				const n = Math.max(1, row.length);
				const cw = (rowW - (n - 1) * BTN_GAP) / n;

				row.forEach((label, i) => {
					const ux = bxx + i * (cw + BTN_GAP);

					body.push(
						`<rect x="${round(ux)}" y="${round(byy)}" width="${round(cw)}" height="${BTN_H}" rx="8" fill="${p.button}" stroke="${p.buttonStroke}"/><text x="${round(ux + cw / 2)}" y="${round(byy + BTN_H / 2 + 4)}" font-size="13" font-weight="500" fill="${p.buttonText}" text-anchor="middle" font-family="${FONT}">${esc(label)}</text>`,
					);
				});

				byy += BTN_H + BTN_GAP;
			}

			y = byy - BTN_GAP;
		}

		y += GAP;
		wrapMessage();
	}

	const H = Math.round(y - GAP + PAD);
	const defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg0}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient></defs>`;
	const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`;

	return `${open}${defs}<rect width="${W}" height="${H}" fill="url(#bg)"/>${body.join("")}</svg>`;
}
