import assert from "node:assert/strict";
import test from "node:test";
import { disableLinkPreview, LinkPreview, linkPreview } from "./index.js";

test("builds an empty options object by default", () => {
	assert.deepEqual(new LinkPreview().build(), {});
});

test("chains url + placement + sizing", () => {
	const options = linkPreview("https://example.com").showAboveText().preferLargeMedia().build();

	assert.deepEqual(options, {
		url: "https://example.com",
		show_above_text: true,
		prefer_large_media: true,
	});
});

test("linkPreview() with no url starts empty", () => {
	assert.deepEqual(linkPreview().build(), {});
});

test("disable() defaults to true and can be turned back off", () => {
	assert.deepEqual(linkPreview("https://x.test").disable().build(), {
		url: "https://x.test",
		is_disabled: true,
	});
	assert.deepEqual(linkPreview("https://x.test").disable().disable(false).build(), {
		url: "https://x.test",
		is_disabled: false,
	});
});

test("preferSmallMedia() and preferLargeMedia() are independent flags", () => {
	const options = linkPreview("https://x.test").preferSmallMedia().preferLargeMedia().build();
	assert.deepEqual(options, {
		url: "https://x.test",
		prefer_small_media: true,
		prefer_large_media: true,
	});
});

test("disableLinkPreview() shorthand", () => {
	assert.deepEqual(disableLinkPreview(), { is_disabled: true });
});

test("build() returns a fresh object each time, not a live reference", () => {
	const builder = linkPreview("https://x.test");
	const first = builder.build();
	first.url = "mutated";
	assert.equal(builder.build().url, "https://x.test");
});

test("toJSON() matches build() for JSON.stringify", () => {
	const builder = linkPreview("https://x.test").showAboveText();
	assert.equal(
		JSON.stringify({ link_preview_options: builder }),
		JSON.stringify({ link_preview_options: builder.build() }),
	);
});
