import assert from "node:assert/strict";
import test from "node:test";
import { type ChatMessage, chat, renderChat } from "./index.js";

// --- test helpers ---------------------------------------------------------

/** true if `s` contains a high surrogate with no matching low surrogate, or vice versa. */
function hasLoneSurrogate(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);

		if (c >= 0xd800 && c <= 0xdbff) {
			const next = s.charCodeAt(i + 1);
			if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
		} else if (c >= 0xdc00 && c <= 0xdfff) {
			const prev = s.charCodeAt(i - 1);
			if (!(prev >= 0xd800 && prev <= 0xdbff)) return true;
		}
	}

	return false;
}

/** lightweight tag-balance check — not a full XML parser, but catches gross open/close mismatches. */
function isTagBalanced(svg: string): boolean {
	const open: Record<string, number> = {};
	const close: Record<string, number> = {};
	const tagRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
	let m: RegExpExecArray | null;

	// biome-ignore lint: exec-loop is the plain idiom here
	while ((m = tagRe.exec(svg))) {
		const [, closing, name, selfClosing] = m;
		if (closing) close[name as string] = (close[name as string] ?? 0) + 1;
		else if (!selfClosing) open[name as string] = (open[name as string] ?? 0) + 1;
	}

	for (const name of new Set([...Object.keys(open), ...Object.keys(close)]))
		if ((open[name] ?? 0) !== (close[name] ?? 0)) return false;

	return true;
}

const sample: ChatMessage[] = [
	{ from: "user", text: "/start", time: "23:33", status: "read" },
	{ from: "bot", text: "hello, unknown person", time: "23:33" },
	{ from: "bot", buttons: [["Useless button"]] },
];

// --- baseline behaviour -----------------------------------------------------

test("renders a well-formed svg with the message text", () => {
	const svg = renderChat(sample);

	assert.ok(svg.startsWith("<svg"));
	assert.ok(svg.trimEnd().endsWith("</svg>"));
	assert.ok(isTagBalanced(svg));

	assert.match(svg, /width="380"/); // default width

	assert.ok(svg.includes("hello, unknown person"));
	assert.ok(svg.includes("Useless button"));
});

test("escapes xml-significant characters in text", () => {
	const svg = renderChat([{ from: "bot", text: '<b> & "q" \'s' }]);

	assert.ok(svg.includes("&lt;b&gt; &amp;"));
	assert.ok(svg.includes("&quot;q&quot;"));
	assert.ok(svg.includes("&#39;s"));
	assert.ok(!svg.includes("<b>")); // raw angle bracket must not leak
});

test("wraps long text into multiple lines (svg has no auto-wrap)", () => {
	const long = "word ".repeat(60).trim();
	const svg = renderChat([{ from: "bot", text: long }], { width: 320 });
	const lines = (svg.match(/<tspan/g) ?? []).length;

	assert.ok(lines >= 3, `expected several wrapped lines, got ${lines}`);
});

test("draws read ticks only for outgoing messages", () => {
	const withTicks = renderChat([{ from: "user", text: "hi", status: "read" }]);
	const incoming = renderChat([{ from: "bot", text: "hi", status: "read" }]);

	assert.ok((withTicks.match(/stroke-linejoin="round"/g) ?? []).length >= 2);
	assert.ok(!incoming.includes('stroke-linejoin="round"'));
});

test("height grows with more messages", () => {
	const one = renderChat([{ from: "bot", text: "a" }]);
	const many = renderChat([
		{ from: "bot", text: "a" },
		{ from: "user", text: "b" },
		{ from: "bot", text: "c" },
	]);

	const h = (s: string) => Number(s.match(/height="(\d+)"/)?.[1] ?? 0);
	assert.ok(h(many) > h(one));
});

test("applies entity styling (bold / link / strike)", () => {
	const svg = renderChat([
		{
			from: "bot",
			text: "bold link gone",
			entities: [
				{ type: "bold", offset: 0, length: 4 },
				{ type: "text_link", offset: 5, length: 4, url: "https://yaebal.mom" },
				{ type: "strikethrough", offset: 10, length: 4 },
			],
		},
	]);

	assert.ok(svg.includes('font-weight="600"'));
	assert.ok(svg.includes('text-decoration="line-through"'));
});

test("masks spoiler text with blocks (content not leaked, including in the a11y desc)", () => {
	const svg = renderChat([
		{ from: "bot", text: "secret", entities: [{ type: "spoiler", offset: 0, length: 6 }] },
	]);

	assert.ok(svg.includes("██████"));
	assert.ok(!svg.includes(">secret<"));
	assert.ok(!svg.includes("secret</desc>"));
	assert.ok(!svg.toLowerCase().includes("secret"));
});

test("renders a poll with percentage bars", () => {
	const svg = renderChat([
		{
			from: "bot",
			poll: {
				question: "tabs or spaces?",
				options: [
					{ text: "tabs", voter_count: 3 },
					{ text: "spaces", voter_count: 1 },
				],
				total_voter_count: 4,
			},
		},
	]);

	assert.ok(svg.includes("tabs or spaces?"));
	assert.ok(svg.includes("75%"));
	assert.ok(svg.includes("25%"));

	// poll sits at media width (252), not the full 76%-of-canvas text bubble width
	const track = svg.match(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="4"/);
	assert.ok(track, "poll bar track not found");
	assert.equal(Number(track[1]), 252 - 11 * 2); // MW - PADX*2
});

test("poll percentages always sum to 100 (largest-remainder rounding)", () => {
	const svg = renderChat([
		{
			from: "bot",
			poll: {
				question: "three-way tie?",
				options: [
					{ text: "a", voter_count: 1 },
					{ text: "b", voter_count: 1 },
					{ text: "c", voter_count: 1 },
				],
			},
		},
	]);

	const pcts = [...svg.matchAll(/>(\d+)%</g)].map((m) => Number(m[1]));
	assert.equal(
		pcts.reduce((a, b) => a + b, 0),
		100,
	);
});

test("renders picture media (photo) with a caption, using minimal partial fixtures", () => {
	// the README's minimal fixture shape (just width/height) must compile and render —
	// not just a full @yaebal/types PhotoSize.
	const svg = renderChat([{ from: "bot", photo: [{ width: 800, height: 600 }], caption: "a cat" }]);

	assert.ok(svg.includes("clipPath")); // picture is clipped to a rounded rect
	assert.ok(svg.includes("a cat"));
});

test("renders a sticker standalone (no bubble path)", () => {
	const svg = renderChat([{ from: "bot", sticker: { emoji: "🔥" } }]);
	assert.ok(svg.includes("🔥"));
});

test("wraps every rendered message in a g.yb-msg group", () => {
	const svg = renderChat([
		{ from: "user", text: "/start" },
		{ from: "bot", text: "hi", buttons: [["ok"]] },
		{ from: "system", text: "note" },
		{ from: "system", text: "" }, // empty system message renders nothing — no group
	]);

	assert.equal((svg.match(/<g class="yb-msg">/g) ?? []).length, 3);
	assert.equal((svg.match(/<g\b/g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length);
});

test("inline keyboard aligns flush with its bubble", () => {
	const svg = renderChat([{ from: "bot", text: "hi", buttons: [["only button"]] }]);
	const rect = svg.match(/<rect x="[\d.]+" y="[\d.]+" width="(\d+)" height="34"/);

	assert.ok(rect, "button rect not found");
	assert.equal(Number(rect[1]), 252); // MW — media/keyboard width
});

// --- bug-fix regressions -----------------------------------------------------

test("two renders never collide on id (fixes cross-render <clipPath>/gradient bleed)", () => {
	const a = renderChat([{ from: "bot", photo: [{ width: 10, height: 10 }] }]);
	const b = renderChat([{ from: "bot", photo: [{ width: 10, height: 10 }] }]);

	const idsOf = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	const aIds = new Set(idsOf(a));
	const bIds = idsOf(b);

	for (const id of bIds) assert.ok(!aIds.has(id), `id "${id}" collides between two renders`);
});

test("idPrefix option makes ids deterministic across renders", () => {
	const a = renderChat([{ from: "bot", photo: [{ width: 10, height: 10 }] }], {
		idPrefix: "fixed",
	});
	const b = renderChat([{ from: "bot", photo: [{ width: 10, height: 10 }] }], {
		idPrefix: "fixed",
	});

	assert.equal(a, b);
});

test("an emoji name never produces a lone surrogate in the avatar initial", () => {
	const svg = renderChat([{ from: "bot", name: "🚀rocket", text: "hi" }]);
	assert.ok(!hasLoneSurrogate(svg));
	assert.ok(svg.includes("🚀")); // whole emoji kept, not half of it
});

test("hard-wrapping a long run of emoji never splits a surrogate pair", () => {
	const svg = renderChat([{ from: "bot", text: "😀".repeat(200) }], { width: 300 });
	assert.ok(!hasLoneSurrogate(svg));
});

test("a contact's initial never produces a lone surrogate either", () => {
	const svg = renderChat([{ from: "bot", contact: { first_name: "🎉Party", phone_number: "1" } }]);
	assert.ok(!hasLoneSurrogate(svg));
});

test("fullwidth/CJK text wraps sooner than an equal-length latin string (real display width)", () => {
	const cjk = "这".repeat(40);
	const latin = "a".repeat(40);

	const cjkLines = (renderChat([{ from: "bot", text: cjk }], { width: 320 }).match(/<tspan/g) ?? [])
		.length;
	const latinLines = (
		renderChat([{ from: "bot", text: latin }], { width: 320 }).match(/<tspan/g) ?? []
	).length;

	assert.ok(
		cjkLines > latinLines,
		`expected cjk (${cjkLines} lines) to wrap sooner than latin (${latinLines})`,
	);
});

test("xml:space is preserved so indentation in a pre/code block survives", () => {
	const svg = renderChat([
		{
			from: "bot",
			text: "if (x) {\n    return 1;\n}",
			entities: [{ type: "pre", offset: 0, length: 25 }],
		},
	]);

	assert.ok(svg.includes('xml:space="preserve"'));
	assert.ok(svg.includes("    return 1;")); // leading spaces kept as literal characters
});

test("buttons-only messages still show time and read ticks", () => {
	const svg = renderChat([{ from: "user", buttons: [["ok"]], time: "12:00", status: "read" }]);

	assert.ok(svg.includes("12:00"));
	assert.ok(svg.includes('stroke-linejoin="round"'));
});

test("a sticker with text/buttons keeps them instead of silently dropping them", () => {
	const svg = renderChat([
		{
			from: "bot",
			sticker: { emoji: "🔥" },
			text: "look at this",
			buttons: [["nice"]],
		},
	]);

	assert.ok(svg.includes("look at this"));
	assert.ok(svg.includes("nice"));
});

test("an empty message adds no extra vertical gap", () => {
	// different senders on either side of the empty message so message-grouping (which shrinks
	// the gap between consecutive same-sender messages) can't confound the comparison
	const withEmpty = renderChat([
		{ from: "bot", text: "a" },
		{} as ChatMessage,
		{ from: "user", text: "b" },
	]);
	const withoutEmpty = renderChat([
		{ from: "bot", text: "a" },
		{ from: "user", text: "b" },
	]);

	const h = (s: string) => Number(s.match(/height="(\d+)"/)?.[1] ?? 0);
	assert.equal(h(withEmpty), h(withoutEmpty));
});

test("the media placeholder colour is seeded by file identity, not message position", () => {
	const shared = { file_unique_id: "same-photo", width: 10, height: 10 };
	const first = renderChat([
		{ from: "bot", photo: [shared] },
		{ from: "bot", text: "spacer" },
	]);
	const second = renderChat([
		{ from: "bot", text: "spacer" },
		{ from: "bot", photo: [shared] },
	]);

	const grad = (svg: string) => svg.match(/stop-color="(hsl\([^)]+\))"/)?.[1];
	assert.equal(grad(first), grad(second));
});

test("card text (document/audio/contact/venue) truncates instead of overflowing the card", () => {
	const longName = "a-very-long-file-name-that-would-otherwise-overflow-the-card.pdf";
	const svg = renderChat([{ from: "bot", document: { file_name: longName, file_size: 2048 } }]);

	assert.ok(!svg.includes(longName));
	assert.ok(svg.includes("…"));
});

// --- flagship features -----------------------------------------------------

test("dark theme swaps the palette", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }], { theme: "dark" });
	assert.ok(svg.includes("#182533")); // dark incoming bubble colour
});

test("a fully custom palette overrides individual colours", () => {
	const svg = renderChat([{ from: "user", text: "hi" }], {
		theme: "light",
		palette: { out: "#123456" },
	});

	assert.ok(svg.includes("#123456"));
});

test("theme accepts a bespoke Palette object directly", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }], {
		theme: { in: "#abcdef", inText: "#000000" },
	});

	assert.ok(svg.includes("#abcdef"));
});

test("renders every media type without throwing", () => {
	const messages: ChatMessage[] = [
		{ from: "bot", photo: [{ width: 640, height: 480 }] },
		{ from: "bot", animation: { width: 320, height: 240 } },
		{ from: "bot", video: { width: 640, height: 360, duration: 42 } },
		{ from: "bot", voice: { duration: 7 } },
		{ from: "bot", audio: { title: "song", duration: 180 } },
		{ from: "bot", document: { file_name: "report.pdf", file_size: 81920 } },
		{ from: "bot", venue: { title: "cafe", address: "1 main st" } },
		{ from: "bot", location: {} },
		{ from: "bot", contact: { first_name: "Ann", phone_number: "+1 555" } },
		{
			from: "bot",
			poll: { question: "tabs?", options: [{ text: "yes", voter_count: 1 }] },
		},
	];

	const svg = renderChat(messages);
	assert.ok(isTagBalanced(svg));
	assert.ok(svg.includes("report.pdf"));
});

test("reply quote renders the quoted name and text above the message", () => {
	const svg = renderChat([
		{
			from: "bot",
			reply: { name: "unknown person", text: "hello there" },
			text: "of course",
		},
	]);

	assert.ok(svg.includes("unknown person"));
	assert.ok(svg.includes("hello there"));
	assert.ok(svg.includes("of course"));
});

test("reply quote falls back to a media label when there's no quoted text", () => {
	const svg = renderChat([{ from: "bot", reply: { name: "ann", media: "photo" }, text: "nice!" }]);
	assert.ok(svg.includes("Photo"));
});

test("forward header shows the original sender", () => {
	const svg = renderChat([{ from: "bot", forward: { from: "channel news" }, text: "breaking" }]);

	assert.ok(svg.includes("Forwarded from"));
	assert.ok(svg.includes("channel news"));
});

test("reactions render as a pill row with the chosen one highlighted", () => {
	const svg = renderChat([
		{
			from: "bot",
			text: "hi",
			reactions: [
				{ emoji: "🔥", count: 3, chosen: true },
				{ emoji: "👍", count: 1 },
			],
		},
	]);

	assert.ok(svg.includes("🔥"));
	assert.ok(svg.includes("👍"));
	assert.ok(svg.includes(">3<"));
});

test("webpage link-preview card shows site/title/description", () => {
	const svg = renderChat([
		{
			from: "bot",
			text: "check this out https://example.com",
			webpage: { site: "example.com", title: "Example Domain", description: "a sample site" },
		},
	]);

	assert.ok(svg.includes("example.com"));
	assert.ok(svg.includes("Example Domain"));
	assert.ok(svg.includes("a sample site"));
});

test("consecutive same-sender messages group: only the last gets an avatar, only the first a name", () => {
	const svg = renderChat([
		{ from: "bot", name: "yaebal", text: "first" },
		{ from: "bot", name: "yaebal", text: "second" },
		{ from: "bot", name: "yaebal", text: "third" },
	]);

	assert.equal((svg.match(/font-weight="600" fill="#3a8fd6"/g) ?? []).length, 1); // one name label
	assert.equal((svg.match(/<circle cx="29"/g) ?? []).length, 1); // one avatar (cx = PAD + AV/2)
});

test("a different sender breaks the group (gets its own avatar and name)", () => {
	const svg = renderChat([
		{ from: "bot", name: "yaebal", text: "hi" },
		{ from: "bot", name: "other-bot", text: "hey" },
	]);

	assert.equal(
		(svg.match(/text-anchor="middle" font-family="[^"]*">[A-Z]<\/text>/g) ?? []).length,
		2,
	);
});

test("per-message avatar overrides the global/name-derived glyph", () => {
	const svg = renderChat([{ from: "bot", name: "yaebal", avatar: "🐸", text: "hi" }]);
	assert.ok(svg.includes("🐸"));
});

test("edited marker shows next to the time", () => {
	const svg = renderChat([{ from: "bot", text: "hi", time: "10:00", edited: true }]);
	assert.ok(svg.includes("edited"));
});

test("the edited label's extra width is reserved, so it doesn't overlap the last text line", () => {
	// a short last line ("hi") lets the bubble shrink-wrap tight around the text; the reserved
	// meta width must grow to fit "edited 10:00", not just "10:00", or the label clips into the text
	const plain = renderChat([{ from: "bot", text: "hi", time: "10:00" }]);
	const edited = renderChat([{ from: "bot", text: "hi", time: "10:00", edited: true }]);

	const pathWidth = (svg: string) => {
		const m = svg.match(/<path d="M[\d.]+,[\d.]+h([\d.]+)a16,16 0 0 1 16,16/);
		return m ? Number(m[1]) + 16 + 16 : 0; // h-run + the two top corner radii back to full width
	};

	assert.ok(
		pathWidth(edited) > pathWidth(plain),
		"edited bubble should be at least as wide as the longer label needs",
	);
});

test("a11y: root svg has role=img and an auto-generated title", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }]);
	assert.ok(svg.includes('role="img"'));
	assert.ok(svg.includes("<title>"));
});

test("a11y: custom title/desc override the auto-generated ones", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }], {
		a11yTitle: "custom title",
		a11yDesc: "custom desc",
	});

	assert.ok(svg.includes("custom title"));
	assert.ok(svg.includes("custom desc"));
});

test("wallpaper option overrides the two-tone gradient with a solid fill", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }], { wallpaper: "#000000" });
	assert.ok(svg.includes('fill="#000000"'));
});

test("scale option scales width/height attrs but keeps the viewBox at 1x", () => {
	const svg = renderChat([{ from: "bot", text: "hi" }], { width: 380, scale: 2 });
	const w = Number(svg.match(/width="(\d+)"/)?.[1]);
	const viewBoxW = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);

	assert.equal(w, 760);
	assert.equal(viewBoxW, 380);
});

test("the chat() builder produces the same output as an equivalent renderChat call", () => {
	// fix idPrefix on both sides — each render otherwise mints its own unique id sequence
	// (by design, so two SVGs on one page never collide), which would make an exact string
	// comparison meaningless here.
	const opts = { theme: "dark" as const, idPrefix: "t" };
	const built = chat(opts).user("/start").bot("hi", { name: "yaebal" }).system("today").render();
	const direct = renderChat(
		[
			{ from: "user", text: "/start" },
			{ from: "bot", text: "hi", name: "yaebal" },
			{ from: "system", text: "today" },
		],
		opts,
	);

	assert.equal(built, direct);
});
