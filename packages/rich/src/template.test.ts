import assert from "node:assert/strict";
import test from "node:test";
import { heading, list, paragraph } from "./blocks.js";
import { RichDocument } from "./document.js";
import { bold } from "./inline.js";
import { RichError } from "./node.js";
import { document, html, md } from "./template.js";

test("tagged form escapes interpolated text per dialect and keeps the literal skeleton raw", () => {
	const user = "<script>alert(1)</script>";

	assert.equal(html`<p>${user}</p>`.content, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
	assert.equal(md`# ${"a*b"}`.content, "# a\\*b");
});

test("the same builder node renders into whichever dialect the template asks for", () => {
	const status = bold("ok");

	assert.equal(html`state: ${status}`.content, "state: <b>ok</b>");
	assert.equal(md`state: ${status}`.content, "state: **ok**");
});

test("tagged form dedents the literal skeleton but not interpolated values", () => {
	const doc = md`
		# title

		${"  indented value"}
	`;

	assert.equal(doc.content, "# title\n\n  indented value");
});

test("array and falsy interpolations — arrays concatenate, null/undefined/false vanish", () => {
	const cond = false as boolean;

	assert.equal(html`${["a", bold("b")]}${cond && "no"}${null}`.content, "a<b>b</b>");
});

test("a RichDocument interpolates raw when the dialect matches, throws RichError when it doesn't", () => {
	const inner = md`**pre-rendered**`;

	assert.equal(md`${inner}!`.content, "**pre-rendered**!");
	assert.throws(() => html`${inner}`, RichError);
});

test("plain-function form passes a pre-formatted string through untouched", () => {
	assert.equal(html("<p>as-is</p>").content, "<p>as-is</p>");
	assert.equal(md("# as-is").content, "# as-is");
});

test("block-array form joins blocks — blank lines in markdown, adjacent tags in html", () => {
	const blocks = [heading(1, "t"), paragraph("p"), list(["a"])];

	assert.equal(html(blocks).content, "<h1>t</h1><p>p</p><ul><li>a</li></ul>");
	assert.equal(md(blocks).content, "# t\n\np\n\n- a");
});

test("templates return a RichDocument that serializes to the right InputRichMessage shape", () => {
	assert.deepEqual(html`x`.toInputRichMessage(), { html: "x" });
	assert.deepEqual(md`x`.toInputRichMessage(), { markdown: "x" });
});

test("RichDocument fluent flags land in the payload, and toJSON() mirrors toInputRichMessage()", () => {
	const doc = html`x`.rtl().noEntityDetection();

	assert.deepEqual(doc.toInputRichMessage(), {
		html: "x",
		is_rtl: true,
		skip_entity_detection: true,
	});
	assert.deepEqual(JSON.parse(JSON.stringify({ rich_message: doc })), {
		rich_message: { html: "x", is_rtl: true, skip_entity_detection: true },
	});
});

test("RichDocument flags are settable to false explicitly", () => {
	assert.deepEqual(html`x`.rtl(false).toInputRichMessage(), { html: "x", is_rtl: false });
});

test("document() assembles blocks with options — html by default, markdown on request", () => {
	assert.deepEqual(document([paragraph("hi")]).toInputRichMessage(), { html: "<p>hi</p>" });
	assert.deepEqual(
		document([paragraph("hi")], { dialect: "markdown", rtl: true }).toInputRichMessage(),
		{
			markdown: "hi",
			is_rtl: true,
		},
	);
	assert.deepEqual(document(paragraph("hi"), { skipEntityDetection: true }).toInputRichMessage(), {
		html: "<p>hi</p>",
		skip_entity_detection: true,
	});
});

test("document() result is a RichDocument, so the fluent setters chain onto it", () => {
	const doc = document([paragraph("hi")]);

	assert.ok(doc instanceof RichDocument);
	assert.deepEqual(doc.rtl().toInputRichMessage(), { html: "<p>hi</p>", is_rtl: true });
});
