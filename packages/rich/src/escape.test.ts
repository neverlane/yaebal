import assert from "node:assert/strict";
import test from "node:test";
import { escapeAttr, escapeMarkdown, escapeMarkdownUrl, escapeText } from "./escape.js";

test("escapeText escapes &, <, > with named entities", () => {
	assert.equal(escapeText("a & b < c > d"), "a &amp; b &lt; c &gt; d");
});

test("escapeText leaves other characters (including quotes) untouched", () => {
	assert.equal(escapeText(`"hi" 'there'`), `"hi" 'there'`);
});

test("escapeAttr additionally escapes double quotes", () => {
	assert.equal(escapeAttr(`say "hi" & bye`), "say &quot;hi&quot; &amp; bye");
});

test("escapeMarkdown backslash-escapes rich-markdown specials", () => {
	assert.equal(
		escapeMarkdown("a*b_c~d=e|f[g]h(i)j#k!l+m-n`o"),
		"a\\*b\\_c\\~d\\=e\\|f\\[g\\]h\\(i\\)j\\#k\\!l\\+m\\-n\\`o",
	);
});

test("escapeMarkdown numeric-entity-escapes &, <, >", () => {
	assert.equal(escapeMarkdown("a & b < c > d"), "a &#38; b &#60; c &#62; d");
});

test("escapeMarkdown leaves plain text untouched", () => {
	assert.equal(escapeMarkdown("hello world 123"), "hello world 123");
});

test("escapeMarkdownUrl escapes parens/backslash so a url can't break out of [text](url)", () => {
	assert.equal(escapeMarkdownUrl("https://x.test/a(b)c\\d"), "https://x.test/a\\(b\\)c\\\\d");
});

test("escapeMarkdownUrl percent-encodes whitespace", () => {
	assert.equal(escapeMarkdownUrl("https://x.test/a b"), "https://x.test/a%20b");
});
