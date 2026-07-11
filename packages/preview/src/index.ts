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
 *     {
 *       from: "bot", name: "yaebal",
 *       reply: { name: "unknown person", text: "hello, unknown person" },
 *       text: "of course. what did you expect?",
 *       reactions: [{ emoji: "🔥", count: 3, chosen: true }],
 *     },
 *   ], { theme: "light" });
 */

import type { MessageEntity } from "@yaebal/types";
import { computeGroups, forwardBlock, reactionsRow, replyBlock } from "./bubble.js";
import {
	badge,
	card,
	durPill,
	ellipsize,
	MW,
	mapTile,
	picture,
	playGlyph,
	pollBlock,
	waveform,
	webpageBlock,
} from "./media.js";
import { clamp, dur, esc, hash, IdScope, meta, metaWidth, round, rr } from "./svg.js";
import type { Block } from "./text.js";
import { layoutText, wrapPlainText } from "./text.js";
import { AVATAR_COLORS, FONT, LH, PADX, PADY, resolvePalette } from "./theme.js";
import type { ChatMessage, RenderOptions } from "./types.js";
import { graphemes, initialOf } from "./unicode.js";

export type { Palette, Theme } from "./theme.js";
export type {
	ChatMessage,
	ForwardHeader,
	Loose,
	LoosePoll,
	Reaction,
	RenderOptions,
	ReplyQuote,
	Side,
	TickStatus,
	WebpagePreview,
} from "./types.js";

/** truncate by grapheme cluster, not UTF-16 code unit — a plain `.slice()` can cut a long run
 * of emoji in half, leaving a lone surrogate in the `<desc>`. */
function truncateChars(s: string, n: number): string {
	const g = graphemes(s);
	return g.length > n ? `${g.slice(0, n - 1).join("")}…` : s;
}

/** mask any spoiler-covered text before it can reach the auto-generated `<desc>` — the visible
 * bubble hides spoilers behind block glyphs, so the accessibility metadata must too. */
function maskSpoilers(text: string, entities: MessageEntity[] | undefined): string {
	const spoilers = entities?.filter((e) => e.type === "spoiler");
	if (!spoilers?.length) return text;

	let out = "";
	let i = 0; // UTF-16 code-unit offset, matching MessageEntity.offset/length

	for (const ch of text) {
		out += spoilers.some((e) => i >= e.offset && i < e.offset + e.length) ? "•" : ch;
		i += ch.length;
	}

	return out;
}

/** render a telegram-style chat to an SVG string. */
export function renderChat(messages: ChatMessage[], options: RenderOptions = {}): string {
	const W = Math.max(240, Math.round(options.width ?? 380));
	const p = resolvePalette(options.theme, options.palette);
	const PAD = 14;
	const GAP = 10;
	const GROUP_GAP = 3; // vertical gap between consecutive same-sender messages
	const AV = 30;
	const AVGAP = 8;
	const RAD = 16;
	const TAIL = 5;
	const BTN_H = 34;
	const BTN_GAP = 4;
	const maxBubbleW = Math.round(W * 0.76);
	const body: string[] = [];
	const ids = new IdScope(options.idPrefix);
	const groups = computeGroups(messages);

	let y = PAD;

	for (let idx = 0; idx < messages.length; idx++) {
		const m = messages[idx] as ChatMessage;
		const grp = groups[idx] ?? { first: true, last: true };

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
		const trailingGap = grp.last ? GAP : GROUP_GAP;

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

		// sticker with nothing else attached: standalone image/emoji, no bubble (matches telegram).
		// a sticker with text/caption/buttons/reply/forward falls through to the normal bubble
		// pipeline below instead of silently dropping that content.
		if (m.sticker) {
			const needsBubble = !!(m.text || m.caption || m.buttons?.length || m.reply || m.forward);

			if (!needsBubble) {
				const sz = 116;
				const sx = out ? W - PAD - sz : PAD + indent;

				if (m.src) {
					const c = ids.next("c");
					body.push(
						`<clipPath id="${c}"><rect x="${round(sx)}" y="${round(y)}" width="${sz}" height="${sz}" rx="10"/></clipPath><image href="${esc(m.src)}" x="${round(sx)}" y="${round(y)}" width="${sz}" height="${sz}" clip-path="url(#${c})" preserveAspectRatio="xMidYMid meet"/>`,
					);
				} else {
					body.push(
						`<text x="${round(sx + sz / 2)}" y="${round(y + sz / 2 + 30)}" font-size="84" text-anchor="middle">${esc(m.sticker.emoji ?? "🎈")}</text>`,
					);
				}

				body.push(meta(out ? W - PAD : sx + sz, y + sz, time, m.status, out, p, false, m.edited));
				y += sz;

				if (m.reactions?.length) {
					const rx = out ? W - PAD - sz : sx;
					const rr_ = reactionsRow(rx, y + 6, m.reactions, p);
					body.push(rr_.s);
					y += rr_.h ? rr_.h + 6 : 0;
				}

				y += trailingGap;
				wrapMessage();
				continue;
			}
		}

		// build content blocks — reply/forward/webpage decorations first, then media, then text.
		// they're all plain Blocks, so the bubble-sizing math below treats them uniformly.
		const blocks: { block: Block; bleed: boolean }[] = [];

		if (m.forward) blocks.push({ block: forwardBlock(m.forward, p), bleed: false });
		if (m.reply) blocks.push({ block: replyBlock(m.reply, MW - PADX * 2, p), bleed: false });
		if (m.webpage)
			blocks.push({
				block: webpageBlock(
					m.webpage.site,
					m.webpage.title,
					m.webpage.description,
					m.webpage.src,
					MW - PADX * 2,
					base,
					p,
				),
				bleed: false,
			});

		const pic = (
			natW: number | undefined,
			natH: number | undefined,
			seed: string | undefined,
			ov?: (x: number, y: number, w: number, h: number) => string,
		) => {
			const clip = ids.next("c");
			return picture(m.src, natW, natH, clip, seed ?? clip, !!m.spoiler, ov ?? (() => ""));
		};

		if (m.photo) {
			const largest = m.photo.at(-1);
			blocks.push({
				block: pic(largest?.width, largest?.height, largest?.file_unique_id ?? largest?.file_id),
				bleed: true,
			});
		} else if (m.animation) {
			const a = m.animation;
			blocks.push({
				block: pic(a.width, a.height, a.file_unique_id ?? a.file_id, (x, y2) =>
					badge(x, y2, "GIF"),
				),
				bleed: true,
			});
		} else if (m.video) {
			const v = m.video;
			blocks.push({
				block: pic(
					v.width,
					v.height,
					v.file_unique_id ?? v.file_id,
					(x, y2, w, h) => playGlyph(x + w / 2, y2 + h / 2) + durPill(x, y2 + h, dur(v.duration)),
				),
				bleed: true,
			});
		} else if (m.location) {
			const h = 132;
			blocks.push({
				block: { w: MW, h, render: (x, y2) => mapTile(x, y2, MW, h, p, ids.next("c")) },
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
						let s = mapTile(x, y2, MW, mh, p, ids.next("c"));
						s += `<text x="${round(x)}" y="${round(y2 + mh + 17)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(ellipsize(v.title ?? "venue", MW))}</text>`;
						s += `<text x="${round(x)}" y="${round(y2 + mh + 35)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(ellipsize(v.address ?? "", MW))}</text>`;
						return s;
					},
				},
				bleed: true,
			});
		} else if (m.sticker) {
			// only reached when the sticker also carries text/caption/buttons/reply/forward —
			// render it as a boxed block instead of silently dropping the rest of the message.
			const size = MW;
			const emoji = m.sticker.emoji;
			blocks.push({
				block: {
					w: size,
					h: size,
					render: (x, y2) => {
						if (m.src) {
							const c = ids.next("c");
							return `<clipPath id="${c}"><rect x="${round(x)}" y="${round(y2)}" width="${size}" height="${size}" rx="14"/></clipPath><image href="${esc(m.src)}" x="${round(x)}" y="${round(y2)}" width="${size}" height="${size}" clip-path="url(#${c})" preserveAspectRatio="xMidYMid meet"/>`;
						}
						return `<text x="${round(x + size / 2)}" y="${round(y2 + size / 2 + 28)}" font-size="80" text-anchor="middle">${esc(emoji ?? "🎈")}</text>`;
					},
				},
				bleed: true,
			});
		}

		if (m.voice) {
			const d = m.voice.duration;
			blocks.push({
				block: card(40, (x, y2) => {
					const cy = y2 + 20;
					return `<circle cx="${round(x + 18)}" cy="${round(cy)}" r="18" fill="${p.bar}"/><path d="M${round(x + 14)},${round(cy - 7)} l9,7 l-9,7 z" fill="#fff"/>${waveform(x + 44, cy, p.bar, p.barTrack)}<text x="${round(x + 44)}" y="${round(cy + 18)}" font-size="11" fill="${p.meta}" font-family="${FONT}">${dur(d)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.audio) {
			const a = m.audio;
			blocks.push({
				block: card(44, (x, y2) => {
					const cy = y2 + 22;
					const title = ellipsize(a.title ?? a.file_name ?? "audio", 180);
					const sub = ellipsize(a.performer ?? dur(a.duration), 180);
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
				block: card(44, (x, y2) => {
					const cy = y2 + 22;
					return `<rect x="${round(x)}" y="${round(y2)}" width="44" height="44" rx="12" fill="${p.bar}"/><path d="M${round(x + 14)},${round(cy - 11)} h11 l5,5 v17 h-16 z" fill="rgba(255,255,255,0.9)"/><text x="${round(x + 54)}" y="${round(cy - 2)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(ellipsize(d.file_name ?? "document", 180))}</text><text x="${round(x + 54)}" y="${round(cy + 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(kb)}</text>`;
				}),
				bleed: false,
			});
		} else if (m.contact) {
			const c = m.contact;
			const nm = `${c.first_name ?? "Contact"}${c.last_name ? ` ${c.last_name}` : ""}`;
			const col = AVATAR_COLORS[hash(nm) % AVATAR_COLORS.length] ?? "#65aadd";
			blocks.push({
				block: card(44, (x, y2) => {
					const cy = y2 + 22;
					return `<circle cx="${round(x + 22)}" cy="${round(cy)}" r="22" fill="${col}"/><text x="${round(x + 22)}" y="${round(cy + 6)}" font-size="17" font-weight="600" fill="#fff" text-anchor="middle" font-family="${FONT}">${esc(initialOf(nm))}</text><text x="${round(x + 54)}" y="${round(cy - 2)}" font-size="13.5" font-weight="600" fill="${base}" font-family="${FONT}">${esc(ellipsize(nm, 180))}</text><text x="${round(x + 54)}" y="${round(cy + 15)}" font-size="12" fill="${p.meta}" font-family="${FONT}">${esc(c.phone_number ?? "")}</text>`;
				}),
				bleed: false,
			});
		} else if (m.poll) {
			blocks.push({ block: pollBlock(m.poll, MW - PADX * 2, base, p), bleed: false });
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

		if (!blocks.length && !m.buttons?.length && !m.reactions?.length) continue; // nothing to render — no gap consumed

		let bubbleW = 0;
		if (blocks.length) {
			// bubble width: bleed media → media width; else widest padded block
			const bleedW = hasBleed ? MW : 0;
			const padW =
				Math.max(0, ...blocks.filter((b) => !b.bleed).map((b) => b.block.w)) +
				(blocks.some((b) => !b.bleed) ? PADX * 2 : 0);

			const lastIsText = !blocks[blocks.length - 1]?.bleed && (!!tText || !!cText);
			const metaInline =
				lastIsText && (time || m.edited) ? metaWidth(time, out, !!m.status, m.edited) + 8 : 0;

			bubbleW = Math.max(bleedW, padW);

			if (lastIsText) {
				const lastW = blocks[blocks.length - 1]?.block.w ?? 0;
				bubbleW = Math.max(bubbleW, Math.min(maxBubbleW, lastW + PADX * 2 + metaInline));
			}

			bubbleW = clamp(bubbleW, 60, maxBubbleW);

			// an inline keyboard spans at least media width — widen the bubble to match, so the
			// bubble and its keyboard sit flush like one telegram message
			if (m.buttons?.length) bubbleW = clamp(Math.max(bubbleW, MW), 60, maxBubbleW);

			// stack height
			let inner = 0;
			blocks.forEach((b, i) => {
				inner += b.block.h;
				if (i < blocks.length - 1) inner += b.bleed && !blocks[i + 1]?.bleed ? PADY : 6;
			});

			// name sits on its own row above the first non-bleed block — count its height, and only
			// on the first message of a grouped series (telegram shows the sender name once per group)
			const showName = grp.first && !out && !!m.name && !blocks[0]?.bleed;
			const nameH = showName ? LH : 0;
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
						`<text x="${round(tx)}" y="${round(y + 11 + i * 14)}" font-size="11" fill="${p.meta}" text-anchor="${anchor}" font-family="'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace">${esc(line)}</text>`,
					);
				});
			}

			// only the last bubble of a grouped series gets the pointed "tail" corner; earlier
			// messages in the series round that corner the same as the others.
			const tailCorner = grp.last ? TAIL : RAD;
			const path = out
				? rr(bx, by, bubbleW, bubbleH, RAD, RAD, tailCorner, RAD)
				: rr(bx, by, bubbleW, bubbleH, RAD, RAD, RAD, tailCorner);

			body.push(`<path d="${path}" fill="${out ? p.out : p.in}"/>`);

			// avatar — only on the last message of a grouped series (telegram aligns it to the
			// bottom of the group instead of repeating it on every bubble)
			if (!out && grp.last) {
				const who = m.name ?? "";
				const glyph = m.avatar ?? options.avatar ?? (who ? initialOf(who) : undefined) ?? "🤖";
				const ac = AVATAR_COLORS[hash(who || "bot") % AVATAR_COLORS.length] ?? "#7bc862";
				const cy = by + bubbleH - AV / 2;

				body.push(
					`<circle cx="${round(PAD + AV / 2)}" cy="${round(cy)}" r="${AV / 2}" fill="${ac}"/><text x="${round(PAD + AV / 2)}" y="${round(cy + 5)}" font-size="14" font-weight="600" fill="#fff" text-anchor="middle" font-family="${FONT}">${esc(glyph)}</text>`,
				);
			}

			// name (incoming, above first padded block, first message of the group only)
			let cursor = by + padTop;
			if (showName) {
				body.push(
					`<text x="${round(bx + PADX)}" y="${round(cursor + 13)}" font-size="13" font-weight="600" fill="${p.name}" font-family="${FONT}">${esc(m.name ?? "")}</text>`,
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
				: by + bubbleH - padBot - (LH - 13) + 4;

			body.push(meta(metaRight, metaBottom, time, m.status, out, p, onScrim, m.edited));

			y = by + bubbleH;
		}

		// under-bubble row width/x shared by the buttons-only meta shim, the buttons row, and the reactions row
		const rowW = Math.max(bubbleW, MW);
		const rowX = out ? W - PAD - rowW : PAD + indent;

		// buttons-only messages still show time/status (previously dropped entirely)
		if (!blocks.length && m.buttons?.length && (time || m.status || m.edited)) {
			body.push(meta(rowX + rowW - 4, y + 14, time, m.status, out, p, false, m.edited));
			y += 16;
		}

		// buttons
		if (m.buttons?.length) {
			let byy = blocks.length ? y + 6 : y;

			for (const row of m.buttons) {
				const n = Math.max(1, row.length);
				const cw = (rowW - (n - 1) * BTN_GAP) / n;

				row.forEach((label, i) => {
					const ux = rowX + i * (cw + BTN_GAP);
					body.push(
						`<rect x="${round(ux)}" y="${round(byy)}" width="${round(cw)}" height="${BTN_H}" rx="8" fill="${p.button}" stroke="${p.buttonStroke}"/><text x="${round(ux + cw / 2)}" y="${round(byy + BTN_H / 2 + 4)}" font-size="13" font-weight="500" fill="${p.buttonText}" text-anchor="middle" font-family="${FONT}">${esc(label)}</text>`,
					);
				});

				byy += BTN_H + BTN_GAP;
			}

			y = byy - BTN_GAP;
		}

		// reactions
		if (m.reactions?.length) {
			const ry = y + (blocks.length || m.buttons?.length ? 6 : 0);
			const { s, h } = reactionsRow(rowX, ry, m.reactions, p);
			body.push(s);
			y = h ? ry + h : y;
		}

		y += trailingGap;
		wrapMessage();
	}

	const H = Math.round(y - GAP + PAD);
	const scale = options.scale ?? 1;
	const bgId = ids.next("bg");
	const defs = options.wallpaper
		? "<defs></defs>"
		: `<defs><linearGradient id="${bgId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg0}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient></defs>`;
	const bgFill = options.wallpaper ? esc(options.wallpaper) : `url(#${bgId})`;

	const title = options.a11yTitle ?? "Telegram-style chat preview";
	const descSource = messages
		.filter((m) => m.text || m.caption)
		.slice(0, 2)
		.map((m) =>
			m.text ? maskSpoilers(m.text, m.entities) : maskSpoilers(m.caption ?? "", m.captionEntities),
		)
		.join(" · ");
	const desc = options.a11yDesc ?? (descSource ? truncateChars(descSource, 200) : undefined);

	const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${round(W * scale)}" height="${round(H * scale)}" viewBox="0 0 ${W} ${H}" role="img" xml:space="preserve" font-family="${FONT}">`;
	const a11y = `<title>${esc(title)}</title>${desc ? `<desc>${esc(desc)}</desc>` : ""}`;

	return `${open}${a11y}${defs}<rect width="${W}" height="${H}" fill="${bgFill}"/>${body.join("")}</svg>`;
}

/** a chainable message-list builder over {@link renderChat} — nicer for docs/examples than a raw array literal. */
export interface ChatBuilder {
	/** append an outgoing ("user") message. */
	user(text: string, extra?: Omit<ChatMessage, "from" | "text">): ChatBuilder;
	/** append an incoming ("bot") message. */
	bot(text: string, extra?: Omit<ChatMessage, "from" | "text">): ChatBuilder;
	/** append a centered system notice (e.g. a date divider). */
	system(text: string): ChatBuilder;
	/** append any raw `ChatMessage` (for media, polls, etc. that don't fit `.user`/`.bot`). */
	push(message: ChatMessage): ChatBuilder;
	/** render the accumulated messages to an SVG string. */
	render(): string;
}

/** `chat({ theme: "dark" }).user("/start").bot("hi", { name: "yaebal" }).render()` */
export function chat(options: RenderOptions = {}): ChatBuilder {
	const messages: ChatMessage[] = [];

	const builder: ChatBuilder = {
		user(text, extra) {
			messages.push({ from: "user", text, ...extra });
			return builder;
		},
		bot(text, extra) {
			messages.push({ from: "bot", text, ...extra });
			return builder;
		},
		system(text) {
			messages.push({ from: "system", text });
			return builder;
		},
		push(message) {
			messages.push(message);
			return builder;
		},
		render() {
			return renderChat(messages, options);
		},
	};

	return builder;
}
