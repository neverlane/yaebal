import assert from "node:assert/strict";
import test from "node:test";
import { bold, italic } from "@yaebal/core";
import { html, htmlToEntities, md, mdToEntities } from "./index.js";

test("html: basic tags map to entities", () => {
	assert.deepEqual(html`<b>hi</b>`, {
		text: "hi",
		entities: [{ type: "bold", offset: 0, length: 2 }],
	});

	assert.deepEqual(html`a <i>b</i> c`, {
		text: "a b c",
		entities: [{ type: "italic", offset: 2, length: 1 }],
	});
});

test("html: link carries href, spoiler variants", () => {
	assert.deepEqual(html`<a href="https://yaebal.mom">go</a>`, {
		text: "go",
		entities: [{ type: "text_link", offset: 0, length: 2, url: "https://yaebal.mom" }],
	});

	assert.deepEqual(htmlToEntities("<tg-spoiler>s</tg-spoiler>"), {
		text: "s",
		entities: [{ type: "spoiler", offset: 0, length: 1 }],
	});

	assert.deepEqual(htmlToEntities('<span class="tg-spoiler">s</span>'), {
		text: "s",
		entities: [{ type: "spoiler", offset: 0, length: 1 }],
	});
});

test("html: decodes entities, keeps stray < literal", () => {
	assert.deepEqual(html`5 &lt; 10 &amp; up`, { text: "5 < 10 & up", entities: [] });
});

test("html: interpolated string is escaped, never re-parsed", () => {
	const r = html`<b>${"<i>x</i>"}</b>`;

	assert.equal(r.text, "<i>x</i>");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 0, length: 8 }]);
});

test("html: interpolation shifts surrounding entity length", () => {
	assert.deepEqual(html`<b>a${"BBB"}c</b>`, {
		text: "aBBBc",
		entities: [{ type: "bold", offset: 0, length: 5 }],
	});
});

test("html: a FormatResult sub is merged with shifted offsets", () => {
	assert.deepEqual(html`hi ${bold("X")}!`, {
		text: "hi X!",
		entities: [{ type: "bold", offset: 3, length: 1 }],
	});
});

test("html: null/undefined/booleans render as empty text", () => {
	assert.deepEqual(html`a${null}b${undefined}c${false}d${true}e`, {
		text: "abcde",
		entities: [],
	});
});

test("html: a sub containing private-use chars can't hijack a later slot", () => {
	// \ue001 == the slot char of the SECOND interpolation with the default base
	const r = html`<b>${"evil\ue001evil"}</b>${"REAL"}`;

	assert.equal(r.text, "evil\ue001evilREAL");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 0, length: 9 }]);
});

test("html: a private-use char in the static template survives literally", () => {
	// \ue000 in the static part forces the slot base to shift past it
	const r = html`pin \ue000 ${bold("x")}`;

	assert.equal(r.text, "pin \ue000 x");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 6, length: 1 }]);
});

test("html: interpolation inside an attribute value is substituted", () => {
	const url = "https://yaebal.mom/?a=1&b=2";
	const r = html`<a href="${url}">go</a>`;

	assert.deepEqual(r, {
		text: "go",
		entities: [{ type: "text_link", offset: 0, length: 2, url }],
	});
});

test("html: pre><code class=language collapses into one pre entity with language", () => {
	assert.deepEqual(htmlToEntities('<pre><code class="language-js">const x = 1</code></pre>'), {
		text: "const x = 1",
		entities: [{ type: "pre", offset: 0, length: 11, language: "js" }],
	});

	// bare pre stays a plain pre; standalone code keeps being code
	assert.deepEqual(htmlToEntities("<pre>x</pre>"), {
		text: "x",
		entities: [{ type: "pre", offset: 0, length: 1 }],
	});
	assert.deepEqual(htmlToEntities("<code>x</code>"), {
		text: "x",
		entities: [{ type: "code", offset: 0, length: 1 }],
	});
});

test("html: blockquote expandable maps to expandable_blockquote", () => {
	assert.deepEqual(htmlToEntities("<blockquote expandable>q</blockquote>").entities, [
		{ type: "expandable_blockquote", offset: 0, length: 1 },
	]);
	assert.deepEqual(htmlToEntities("<blockquote>q</blockquote>").entities, [
		{ type: "blockquote", offset: 0, length: 1 },
	]);
});

test("html: tg-emoji maps to custom_emoji with its id", () => {
	assert.deepEqual(htmlToEntities('<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>'), {
		text: "👍",
		entities: [
			{ type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "5368324170671202286" },
		],
	});
});

test("html: br becomes a newline in all spellings", () => {
	assert.deepEqual(htmlToEntities("a<br>b<br/>c<br />d"), { text: "a\nb\nc\nd", entities: [] });
});

test("html: unclosed tags auto-close at end of input", () => {
	assert.deepEqual(htmlToEntities("<b>hi"), {
		text: "hi",
		entities: [{ type: "bold", offset: 0, length: 2 }],
	});

	assert.deepEqual(
		htmlToEntities("<b>a<i>b").entities.sort((x, y) => x.offset - y.offset),
		[
			{ type: "bold", offset: 0, length: 2 },
			{ type: "italic", offset: 1, length: 1 },
		],
	);
});

test("html: unmatched closing tag is dropped, unknown tags stay literal", () => {
	assert.deepEqual(htmlToEntities("a</b>c"), { text: "ac", entities: [] });
	assert.deepEqual(htmlToEntities("<div>x</div>"), { text: "<div>x", entities: [] });
});

test("md: full dialect — bold, italics, underline, strike, spoiler", () => {
	assert.deepEqual(md`**a** *b* _c_ __d__ ~~e~~ ||f||`, {
		text: "a b c d e f",
		entities: [
			{ type: "bold", offset: 0, length: 1 },
			{ type: "italic", offset: 2, length: 1 },
			{ type: "italic", offset: 4, length: 1 },
			{ type: "underline", offset: 6, length: 1 },
			{ type: "strikethrough", offset: 8, length: 1 },
			{ type: "spoiler", offset: 10, length: 1 },
		],
	});
});

test("md: single delimiters don't trigger mid-word or around whitespace", () => {
	assert.deepEqual(mdToEntities("snake_case_name"), { text: "snake_case_name", entities: [] });
	assert.deepEqual(mdToEntities("a * b * c"), { text: "a * b * c", entities: [] });
	assert.deepEqual(mdToEntities("2 * 3 = 6"), { text: "2 * 3 = 6", entities: [] });
});

test("md: > lines form one blockquote entity", () => {
	assert.deepEqual(mdToEntities("> quoted\n> more\nafter"), {
		text: "quoted\nmore\nafter",
		entities: [{ type: "blockquote", offset: 0, length: 11 }],
	});

	// inline markup keeps working inside the quote; mid-line > stays literal
	const r = mdToEntities("> **b**");
	assert.equal(r.text, "b");
	assert.deepEqual(
		r.entities.sort((x, y) => y.length - x.length),
		[
			{ type: "blockquote", offset: 0, length: 1 },
			{ type: "bold", offset: 0, length: 1 },
		],
	);
	assert.deepEqual(mdToEntities("a > b"), { text: "a > b", entities: [] });
});

test("md: inline code and fenced pre with language", () => {
	assert.deepEqual(mdToEntities("run `npm i`"), {
		text: "run npm i",
		entities: [{ type: "code", offset: 4, length: 5 }],
	});

	// the newline before the closing fence is not part of the body
	assert.deepEqual(mdToEntities("```js\nconst x = 1\n```"), {
		text: "const x = 1",
		entities: [{ type: "pre", offset: 0, length: 11, language: "js" }],
	});
});

test("md: link", () => {
	assert.deepEqual(md`see [docs](https://yaebal.mom)`, {
		text: "see docs",
		entities: [{ type: "text_link", offset: 4, length: 4, url: "https://yaebal.mom" }],
	});
});

test("md: interpolated string is literal (delimiters not parsed)", () => {
	const r = md`**${"**not bold**"}**`;

	assert.equal(r.text, "**not bold**");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 0, length: 12 }]);
});

test("md: interpolation inside a link url is substituted", () => {
	const r = md`[docs](${"https://yaebal.mom"})`;

	assert.deepEqual(r, {
		text: "docs",
		entities: [{ type: "text_link", offset: 0, length: 4, url: "https://yaebal.mom" }],
	});
});

test("md: backslash escapes a delimiter", () => {
	assert.deepEqual(mdToEntities("2 \\* 3 = 6"), { text: "2 * 3 = 6", entities: [] });
	assert.deepEqual(mdToEntities("\\*\\*not bold\\*\\*"), { text: "**not bold**", entities: [] });

	// an escaped delimiter inside a run stays literal and doesn't end the run
	assert.deepEqual(mdToEntities("**a \\** b**"), {
		text: "a ** b",
		entities: [{ type: "bold", offset: 0, length: 6 }],
	});
});

test("md: nested formatting keeps correct offsets", () => {
	const r = md`**bold ${"and"} [more](https://yaebal.mom)**`;

	assert.equal(r.text, "bold and more");

	const boldE = r.entities.find((e) => e.type === "bold");
	const link = r.entities.find((e) => e.type === "text_link");

	assert.deepEqual(boldE, { type: "bold", offset: 0, length: 13 });
	assert.deepEqual(link, { type: "text_link", offset: 9, length: 4, url: "https://yaebal.mom" });
});

test("md: a FormatResult sub merges, entity spanning the slot stretches", () => {
	const r = md`**a${italic("BBB")}c**`;

	assert.equal(r.text, "aBBBc");
	assert.deepEqual(
		r.entities.sort((x, y) => y.length - x.length),
		[
			{ type: "bold", offset: 0, length: 5 },
			{ type: "italic", offset: 1, length: 3 },
		],
	);
});
