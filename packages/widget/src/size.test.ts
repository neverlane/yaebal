import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import * as zlib from "node:zlib";
import { deflateSync } from "node:zlib";
import { WidgetError } from "./limits.js";
import { checkHtml, compressedSize, deflaterFrom, measureHtml, streamDeflateSize } from "./size.js";

/** incompressible ascii of `n` bytes — base64 of random bytes. */
const noise = (n: number) => randomBytes(n).toString("base64").slice(0, n);

test("measureHtml reports bytes and the exact level-9 zlib size", async () => {
	const html = "<b>hello</b>".repeat(50);
	const size = await measureHtml(html);
	assert.equal(size.bytes, html.length);
	assert.equal(size.compressedBytes, deflateSync(Buffer.from(html), { level: 9 }).length);
	assert.equal(size.exact, true);
	assert.equal(size.fits, true);
});

test("measureHtml flags empty, NUL, oversized and over-compressed html as not fitting", async () => {
	assert.equal((await measureHtml("")).fits, false);
	assert.equal((await measureHtml("a\0b")).fits, false);
	assert.equal((await measureHtml("a".repeat(32769))).fits, false);
	assert.equal((await measureHtml(noise(6000))).fits, false);
});

test("the stream fallback is a zlib-format upper bound on level 9", async () => {
	const bytes = new TextEncoder().encode("<p>widget</p>".repeat(200));
	const fallback = await compressedSize(bytes, false);
	const exact = await compressedSize(bytes);
	assert.equal(fallback.exact, false);
	assert.equal(exact.exact, true);
	assert.ok(fallback.size >= exact.size);
	assert.equal(await streamDeflateSize(bytes), fallback.size);
});

test("checkHtml resolves the size for valid html and throws telegram's error codes otherwise", async () => {
	const ok = await checkHtml("<button>tap</button>");
	assert.equal(ok.fits, true);

	const reject = (html: string, c: string, re: RegExp) =>
		assert.rejects(
			checkHtml(html),
			(e: unknown) => e instanceof WidgetError && e.code === c && re.test(e.message),
		);

	await reject("", "INPUT_MEDIA_WIDGET_HTML_INVALID", /empty/);
	await reject("a\0", "INPUT_MEDIA_WIDGET_HTML_INVALID", /NUL/);
	await reject("a".repeat(32769), "INPUT_MEDIA_WIDGET_TOO_LARGE", /32769 bytes/);
	await reject(noise(6000), "INPUT_MEDIA_WIDGET_TOO_LARGE", /zlib-compressed, the limit is 4096/);
	await assert.rejects(
		checkHtml(noise(6000), { useNodeZlib: false }),
		/compressed \(upper bound\)/,
	);
	assert.equal((await measureHtml("<p>x</p>", { useNodeZlib: false })).exact, false);
});

test("deflaterFrom measures with a real zlib and refuses a bundler's empty stub", () => {
	const deflate = deflaterFrom(zlib);
	const bytes = new TextEncoder().encode("<p>stub</p>".repeat(20));
	assert.equal(deflate?.(bytes), deflateSync(bytes, { level: 9 }).length);
	assert.equal(deflaterFrom({}), null);
});
