import assert from "node:assert/strict";
import test from "node:test";
import { bold } from "@yaebal/core";
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

test("md: bold / italic / strike / spoiler", () => {
	assert.deepEqual(md`**a** __b__ ~~c~~ ||d||`, {
		text: "a b c d",
		entities: [
			{ type: "bold", offset: 0, length: 1 },
			{ type: "italic", offset: 2, length: 1 },
			{ type: "strikethrough", offset: 4, length: 1 },
			{ type: "spoiler", offset: 6, length: 1 },
		],
	});
});

test("md: inline code and fenced pre with language", () => {
	assert.deepEqual(mdToEntities("run `npm i`"), {
		text: "run npm i",
		entities: [{ type: "code", offset: 4, length: 5 }],
	});

	assert.deepEqual(mdToEntities("```js\nconst x = 1\n```"), {
		text: "const x = 1\n",
		entities: [{ type: "pre", offset: 0, length: 12, language: "js" }],
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

test("md: backslash escapes a delimiter", () => {
	assert.deepEqual(mdToEntities("2 \\* 3 = 6"), { text: "2 * 3 = 6", entities: [] });
});

test("md: nested formatting keeps correct offsets", () => {
	const r = md`**bold ${"and"} [more](https://yaebal.mom)**`;

	assert.equal(r.text, "bold and more");

	const boldE = r.entities.find((e) => e.type === "bold");
	const link = r.entities.find((e) => e.type === "text_link");

	assert.deepEqual(boldE, { type: "bold", offset: 0, length: 13 });
	assert.deepEqual(link, { type: "text_link", offset: 9, length: 4, url: "https://yaebal.mom" });
});
