import assert from "node:assert/strict";
import test from "node:test";
import {
	anchorBlock,
	audio,
	blockquote,
	cell,
	collage,
	details,
	divider,
	footer,
	h2,
	heading,
	image,
	item,
	join,
	list,
	map,
	mathBlock,
	paragraph,
	preformatted,
	pullquote,
	slideshow,
	table,
	thinking,
	video,
} from "./blocks.js";
import { bold, italic } from "./inline.js";
import type { RichNode } from "./node.js";

function both(node: RichNode): [html: string, md: string] {
	return [node.render("html"), node.render("markdown")];
}

test("paragraph() — <p> in html, bare text in markdown", () => {
	assert.deepEqual(both(paragraph("hi ", bold("there"))), [
		"<p>hi <b>there</b></p>",
		"hi **there**",
	]);
});

test("heading()/h1–h6 — <hN> / #-prefixed", () => {
	assert.deepEqual(both(heading(3, "title")), ["<h3>title</h3>", "### title"]);
	assert.deepEqual(both(h2("t")), ["<h2>t</h2>", "## t"]);
});

test("preformatted() — <pre><code> with language class / fenced block, code kept raw in the fence", () => {
	assert.deepEqual(both(preformatted("if (a < b) {}", "ts")), [
		'<pre><code class="language-ts">if (a &lt; b) {}</code></pre>',
		"```ts\nif (a < b) {}\n```",
	]);
	assert.equal(preformatted("x").render("html"), "<pre><code>x</code></pre>");
});

test("divider()/footer()/mathBlock()/anchorBlock()", () => {
	assert.deepEqual(both(divider()), ["<hr/>", "---"]);
	assert.deepEqual(both(footer("fin")), ["<footer>fin</footer>", "<footer>fin</footer>"]);
	assert.deepEqual(both(mathBlock("E=mc^2")), [
		"<tg-math-block>E=mc^2</tg-math-block>",
		"$$E=mc^2$$",
	]);
	assert.deepEqual(both(anchorBlock("s1")), ['<a name="s1"></a>', '<a name="s1"></a>']);
});

test("blockquote() — <blockquote> with <cite> / >-prefixed lines with a credit line", () => {
	assert.deepEqual(both(blockquote([paragraph("a"), paragraph("b")], "someone")), [
		"<blockquote><p>a</p><p>b</p><cite>someone</cite></blockquote>",
		">a\n>b\n> — someone",
	]);
});

test("blockquote() in markdown >-prefixes every line of multi-line content", () => {
	assert.equal(
		blockquote([join([paragraph("a"), paragraph("b")])]).render("markdown"),
		">a\n>\n>b",
	);
});

test("pullquote() — <aside> with optional <cite> in both dialects", () => {
	assert.deepEqual(both(pullquote("wow", "them")), [
		"<aside>wow<cite>them</cite></aside>",
		"<aside>wow<cite>them</cite></aside>",
	]);
});

test("table() — full html table; gfm with a structural header row in markdown", () => {
	const node = table(
		[
			[cell("day", { header: true }), cell("count", { header: true, align: "right" })],
			[cell("mon"), cell(128, { align: "right" })],
		],
		{ bordered: true, caption: "week" },
	);

	assert.equal(
		node.render("html"),
		"<table border><caption>week</caption>" +
			'<tr><th>day</th><th align="right">count</th></tr>' +
			'<tr><td>mon</td><td align="right">128</td></tr></table>',
	);
	assert.equal(node.render("markdown"), "week\n\n| day | count |\n| :-- | --: |\n| mon | 128 |");
});

test("table() wraps bare values in a plain cell()", () => {
	assert.deepEqual(both(table([["a", bold("b")]])), [
		"<table><tr><td>a</td><td><b>b</b></td></tr></table>",
		"| a | **b** |\n| :-- | :-- |",
	]);
});

test("cell() supports colspan/rowspan/valign and invisible cells in html; markdown keeps the text", () => {
	const spanned = cell("x", { colspan: 2, rowspan: 3, valign: "middle" });

	assert.equal(spanned.render("html"), '<td colspan="2" rowspan="3" valign="middle">x</td>');
	assert.equal(spanned.render("markdown"), "x");
	assert.equal(cell().render("html"), "<td></td>");
});

test("cell content is escaped, so a `|` cannot break the gfm row", () => {
	assert.equal(table([[cell("a|b")]]).render("markdown"), "| a\\|b |\n| :-- |");
});

test("list() wraps bare values in <li> automatically", () => {
	assert.deepEqual(both(list(["a", bold("b")])), [
		"<ul><li>a</li><li><b>b</b></li></ul>",
		"- a\n- **b**",
	]);
});

test("list({ ordered, start }) numbers items; item value restarts the numbering", () => {
	const node = list(["a", "b", item(["c"], { value: 10 }), "d"], { ordered: true, start: 3 });

	assert.equal(
		node.render("html"),
		'<ol start="3"><li>a</li><li>b</li><li value="10">c</li><li>d</li></ol>',
	);
	assert.equal(node.render("markdown"), "3. a\n4. b\n10. c\n11. d");
});

test("item() checkbox — <input type=checkbox> / gfm task marker", () => {
	const node = list([
		item(["done"], { checkbox: true, checked: true }),
		item(["todo"], { checkbox: true }),
	]);

	assert.equal(
		node.render("html"),
		'<ul><li><input type="checkbox" checked/> done</li><li><input type="checkbox"/> todo</li></ul>',
	);
	assert.equal(node.render("markdown"), "- [x] done\n- [ ] todo");
});

test("item() type override is html-only", () => {
	assert.equal(
		list([item(["x"], { type: "i" })], { ordered: true }).render("html"),
		'<ol><li type="i">x</li></ol>',
	);
	assert.equal(list([item(["x"], { type: "i" })], { ordered: true }).render("markdown"), "1. x");
});

test("details() — html compact; markdown blank-line-separates the body", () => {
	const node = details("more", [paragraph("hidden")], { open: true });

	assert.equal(node.render("html"), "<details open><summary>more</summary><p>hidden</p></details>");
	assert.equal(
		node.render("markdown"),
		"<details open><summary>more</summary>\n\nhidden\n\n</details>",
	);
});

test("media builders — <img>/<video>/<audio> with figure+caption / markdown image with title", () => {
	assert.deepEqual(both(image("https://x.dev/a.png")), [
		'<img src="https://x.dev/a.png"></img>',
		"![](https://x.dev/a.png)",
	]);
	assert.deepEqual(both(video("https://x.dev/a.mp4", { caption: "clip", credit: "me" })), [
		'<figure><video src="https://x.dev/a.mp4"></video><figcaption>clip<cite>me</cite></figcaption></figure>',
		'![](https://x.dev/a.mp4 "clip")',
	]);
	assert.equal(
		audio("https://x.dev/a.mp3", { spoiler: true }).render("html"),
		'<audio src="https://x.dev/a.mp3" data-media-spoiler></audio>',
	);
});

test("collage()/slideshow() — compact html; blank-line-separated media in markdown", () => {
	const node = collage([image("https://x.dev/1.png"), image("https://x.dev/2.png")], {
		caption: "pair",
	});

	assert.equal(
		node.render("html"),
		'<tg-collage><img src="https://x.dev/1.png"></img><img src="https://x.dev/2.png"></img>' +
			"<figcaption>pair</figcaption></tg-collage>",
	);
	assert.equal(
		node.render("markdown"),
		"<tg-collage>\n\n![](https://x.dev/1.png)\n\n![](https://x.dev/2.png)\n\n" +
			"<figcaption>pair</figcaption></tg-collage>",
	);
	assert.equal(
		slideshow([image("https://x.dev/1.png")]).render("html"),
		'<tg-slideshow><img src="https://x.dev/1.png"></img></tg-slideshow>',
	);
});

test("map() — <tg-map> with telegram's field names as attributes, in both dialects", () => {
	const node = map(
		{ latitude: 55.75, longitude: 37.61 },
		{ zoom: 14, width: 400, height: 300 },
		{ caption: "moscow" },
	);
	const expected =
		'<tg-map latitude="55.75" longitude="37.61" zoom="14" width="400" height="300">' +
		"<figcaption>moscow</figcaption></tg-map>";

	assert.deepEqual(both(node), [expected, expected]);
});

test("thinking() — draft-only <tg-thinking> in both dialects", () => {
	assert.deepEqual(both(thinking("hmm ", italic("…"))), [
		"<tg-thinking>hmm <i>…</i></tg-thinking>",
		"<tg-thinking>hmm *…*</tg-thinking>",
	]);
});

test("join() — inline entries join with the separator, block entries blank-line-join in markdown", () => {
	assert.equal(join(["a", "b"], " · ").render("html"), "a · b");
	assert.equal(join([paragraph("a"), paragraph("b")]).render("markdown"), "a\n\nb");
	assert.equal(join([paragraph("a"), paragraph("b")]).render("html"), "<p>a</p><p>b</p>");
	assert.equal(join([paragraph("a"), "b"]).level, "block");
	assert.equal(join(["a", "b"]).level, "inline");
});
