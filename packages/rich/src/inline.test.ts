import assert from "node:assert/strict";
import test from "node:test";
import {
	anchor,
	anchorLink,
	bold,
	br,
	code,
	customEmoji,
	dateTime,
	italic,
	link,
	marked,
	math,
	reference,
	referenceLink,
	spoiler,
	strikethrough,
	subscript,
	superscript,
	textMention,
	underline,
} from "./inline.js";
import type { RichNode } from "./node.js";

// every inline builder is dual-dialect: one node, two renders.
function both(node: RichNode): [html: string, md: string] {
	return [node.render("html"), node.render("markdown")];
}

test("wrapper marks render their token pair in each dialect", () => {
	assert.deepEqual(both(bold("x")), ["<b>x</b>", "**x**"]);
	assert.deepEqual(both(italic("x")), ["<i>x</i>", "*x*"]);
	assert.deepEqual(both(strikethrough("x")), ["<s>x</s>", "~~x~~"]);
	assert.deepEqual(both(spoiler("x")), ["<tg-spoiler>x</tg-spoiler>", "||x||"]);
	assert.deepEqual(both(code("x")), ["<code>x</code>", "`x`"]);
	assert.deepEqual(both(marked("x")), ["<mark>x</mark>", "==x=="]);
});

test("marks with no markdown token embed the raw html tag in both dialects", () => {
	assert.deepEqual(both(underline("x")), ["<u>x</u>", "<u>x</u>"]);
	assert.deepEqual(both(subscript("x")), ["<sub>x</sub>", "<sub>x</sub>"]);
	assert.deepEqual(both(superscript("x")), ["<sup>x</sup>", "<sup>x</sup>"]);
});

test("string children are escaped per dialect, so user input cannot inject markup", () => {
	assert.equal(bold("<i>&</i>").render("html"), "<b>&lt;i&gt;&amp;&lt;/i&gt;</b>");
	assert.equal(bold("a*b_c").render("markdown"), "**a\\*b\\_c**");
	// html-significant chars become numeric entities in markdown (a backslash would show).
	assert.equal(bold("<&>").render("markdown"), "**&#60;&#38;&#62;**");
});

test("nested nodes render into the chosen dialect; siblings concatenate", () => {
	const node = bold("a ", italic("b"), " c");

	assert.equal(node.render("html"), "<b>a <i>b</i> c</b>");
	assert.equal(node.render("markdown"), "**a *b* c**");
});

test("null/undefined/false children render as nothing — `cond && node` composes", () => {
	const cond = false as boolean;

	assert.equal(bold("a", null, undefined, cond && italic("b")).render("html"), "<b>a</b>");
});

test("array children are flattened and concatenated", () => {
	assert.equal(bold(["a", ["b", italic("c")]]).render("html"), "<b>ab<i>c</i></b>");
});

test("number and bigint children are stringified then escaped", () => {
	assert.equal(bold(42, "|", 10n).render("markdown"), "**42\\|10**");
});

test("br() is a hard newline in markdown, <br/> in html", () => {
	assert.deepEqual(both(br()), ["<br/>", "\n"]);
});

test("link() escapes the url per dialect so a hostile url cannot break out", () => {
	assert.equal(
		link('https://x.dev/?a=1&b="2"', "t").render("html"),
		'<a href="https://x.dev/?a=1&amp;b=&quot;2&quot;">t</a>',
	);
	assert.equal(link("https://x.dev/a) b", "t").render("markdown"), "[t](https://x.dev/a\\)%20b)");
});

test("textMention() links tg://user?id=… in both dialects", () => {
	assert.deepEqual(both(textMention({ id: 7 }, "dave")), [
		'<a href="tg://user?id=7">dave</a>',
		"[dave](tg://user?id=7)",
	]);
});

test("anchor()/anchorLink() — jump target and #link", () => {
	assert.deepEqual(both(anchor("top")), ['<a name="top"></a>', '<a name="top"></a>']);
	assert.deepEqual(both(anchorLink("top", "up")), ['<a href="#top">up</a>', "[up](#top)"]);
});

test("customEmoji() — tg-emoji tag / tg://emoji image link", () => {
	assert.deepEqual(both(customEmoji("5368324170671202286", "👍")), [
		'<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>',
		"![👍](tg://emoji?id=5368324170671202286)",
	]);
});

test("math() keeps LaTeX raw in markdown, html-escapes it in html", () => {
	assert.deepEqual(both(math("a_1 < b")), ["<tg-math>a_1 &lt; b</tg-math>", "$a_1 < b$"]);
});

test("dateTime() — best-effort <time> / tg://time image link", () => {
	assert.deepEqual(both(dateTime(1735689600, "R", "soon")), [
		'<time datetime="1735689600" data-format="R">soon</time>',
		"![soon](tg://time?unix=1735689600&format=R)",
	]);
});

test("reference()/referenceLink() — tg-reference tags / markdown footnote syntax", () => {
	assert.deepEqual(both(reference("1", "the fine print")), [
		'<tg-reference name="1">the fine print</tg-reference>',
		"[^1]: the fine print",
	]);
	assert.deepEqual(both(referenceLink("1", "see note")), [
		'<tg-reference-link name="1">see note</tg-reference-link>',
		"[^1]",
	]);
});
