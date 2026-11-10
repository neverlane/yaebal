import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, html, htmlString, json, minifyHtml, RawHtml, raw } from "./html.js";

test("escapeHtml escapes the five html-significant characters", () => {
	assert.equal(
		escapeHtml(`<a href="x">Tom & 'Jerry'</a>`),
		"&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
	);
	assert.equal(escapeHtml("plain"), "plain");
});

test("html escapes values, keeps raw/nested html, joins arrays, drops null/undefined/false", () => {
	const items = ["<one>", "two"];
	const out = html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>${raw("<hr>")}${null}${undefined}${false}${0}${1n}${true}`;
	assert.ok(out instanceof RawHtml);
	assert.equal(out.value, "<ul><li>&lt;one&gt;</li><li>two</li></ul><hr>01true");
	assert.equal(String(out), out.value);
	assert.equal(html`static`.value, "static");
});

test("htmlString unwraps RawHtml and passes strings through", () => {
	assert.equal(htmlString("a"), "a");
	assert.equal(htmlString(raw("b")), "b");
});

test("json is safe inside a script element", () => {
	const out = json({ s: "</script><!--&", line: "a b c" });
	assert.ok(!out.value.includes("</script"));
	assert.ok(!out.value.includes("<"));
	assert.ok(!out.value.includes(" "));
	assert.deepEqual(JSON.parse(out.value), { s: "</script><!--&", line: "a b c" });
	assert.equal(json(undefined).value, "null");
});

test("minifyHtml drops comments, minifies style, collapses line-break whitespace", () => {
	const source = `
		<!-- a comment -->
		<style>
			/* rule */
			.a  >  b ,
			.c { color : red ; margin: 0 ; }
		</style>
		<div>
			<b>bold</b> <i>kept space</i>
		</div>
	`;
	assert.equal(
		minifyHtml(source),
		"<style>.a > b,.c{color : red;margin: 0}</style>\n<div>\n<b>bold</b> <i>kept space</i>\n</div>",
	);
});

test("minifyHtml keeps script, pre and textarea byte-for-byte", () => {
	const script = "<script>\n  const t = `\n    keep\n  `; // <!-- not a comment -->\n</script>";
	const pre = "<pre>\n  a\n    b\n</pre>";
	const out = minifyHtml(raw(`  <p>x</p>\n\n${script}\n${pre}\n<textarea>\n  t\n</textarea>`));
	assert.equal(out, `<p>x</p>\n${script}\n${pre}\n<textarea>\n  t\n</textarea>`);
});
