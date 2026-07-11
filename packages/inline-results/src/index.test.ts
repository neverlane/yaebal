import assert from "node:assert/strict";
import test from "node:test";
import { InlineQueryResult, InputMessageContent } from "./index.js";

test("article() sets input_message_content and merges extras", () => {
	const content = InputMessageContent.text("hello **world**");
	const result = InlineQueryResult.article("1", "Title", content, { description: "desc" });

	assert.deepEqual(result, {
		type: "article",
		id: "1",
		title: "Title",
		input_message_content: { message_text: "hello **world**" },
		description: "desc",
	});
});

test("article() accepts a FormattedText message content untouched (decomposed by bot.api later)", () => {
	const content = InputMessageContent.text({
		text: "hi",
		entities: [{ type: "bold", offset: 0, length: 2 }],
	});
	const result = InlineQueryResult.article("1", "Title", content);

	assert.deepEqual(result.input_message_content, {
		message_text: { text: "hi", entities: [{ type: "bold", offset: 0, length: 2 }] },
	});
});

test("audio() / video() / document() build the right shape with required fields positional", () => {
	assert.deepEqual(InlineQueryResult.audio("1", "https://x/a.mp3", "Song"), {
		type: "audio",
		id: "1",
		audio_url: "https://x/a.mp3",
		title: "Song",
	});

	assert.deepEqual(
		InlineQueryResult.video("1", "https://x/v.mp4", "video/mp4", "https://x/t.jpg", "Video"),
		{
			type: "video",
			id: "1",
			video_url: "https://x/v.mp4",
			mime_type: "video/mp4",
			thumbnail_url: "https://x/t.jpg",
			title: "Video",
		},
	);

	assert.deepEqual(
		InlineQueryResult.document("1", "Doc", "https://x/d.pdf", "application/pdf", { caption: "c" }),
		{
			type: "document",
			id: "1",
			title: "Doc",
			document_url: "https://x/d.pdf",
			mime_type: "application/pdf",
			caption: "c",
		},
	);
});

test("cached.* builders use the file_id field instead of a url", () => {
	assert.deepEqual(InlineQueryResult.cached.photo("1", "file123"), {
		type: "photo",
		id: "1",
		photo_file_id: "file123",
	});

	assert.deepEqual(InlineQueryResult.cached.video("1", "Title", "file456", { description: "d" }), {
		type: "video",
		id: "1",
		title: "Title",
		video_file_id: "file456",
		description: "d",
	});

	assert.deepEqual(InlineQueryResult.cached.sticker("1", "file789"), {
		type: "sticker",
		id: "1",
		sticker_file_id: "file789",
	});
});

test("location() / venue() / contact() carry the required geo/contact fields", () => {
	assert.deepEqual(InlineQueryResult.location("1", 1.5, 2.5, "Spot"), {
		type: "location",
		id: "1",
		latitude: 1.5,
		longitude: 2.5,
		title: "Spot",
	});

	assert.deepEqual(InlineQueryResult.venue("1", 1.5, 2.5, "Place", "1 Main St"), {
		type: "venue",
		id: "1",
		latitude: 1.5,
		longitude: 2.5,
		title: "Place",
		address: "1 Main St",
	});

	assert.deepEqual(InlineQueryResult.contact("1", "+123", "Ann"), {
		type: "contact",
		id: "1",
		phone_number: "+123",
		first_name: "Ann",
	});
});

test("game() needs only the short name", () => {
	assert.deepEqual(InlineQueryResult.game("1", "my_game"), {
		type: "game",
		id: "1",
		game_short_name: "my_game",
	});
});

test("InputMessageContent.invoice carries the required payment fields", () => {
	const content = InputMessageContent.invoice("Widget", "a widget", "payload1", "USD", [
		{ label: "Widget", amount: 500 },
	]);

	assert.deepEqual(content, {
		title: "Widget",
		description: "a widget",
		payload: "payload1",
		currency: "USD",
		prices: [{ label: "Widget", amount: 500 }],
	});
});

test("extra options merge in and can override reply_markup/thumbnails", () => {
	const markup = { inline_keyboard: [[{ text: "go", url: "https://x" }]] };
	const result = InlineQueryResult.photo("1", "https://x/p.jpg", "https://x/t.jpg", {
		reply_markup: markup,
		photo_width: 100,
	});

	assert.equal(result.reply_markup, markup);
	assert.equal(result.photo_width, 100);
});
