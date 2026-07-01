import assert from "node:assert/strict";
import test from "node:test";

import { decodeEntities, htmlToMarkdown, stripTags } from "./lib/html.mjs";
import { parseTypeCell } from "./lib/parse-type.mjs";
import { extractReturnType, extractEnum, extractLength } from "./lib/parse-return-type.mjs";
import { parseSchema, parseVersion } from "./lib/parse-schema.mjs";

test("decodeEntities handles named and numeric entities", () => {
	assert.equal(decodeEntities("bot&#39;s &amp; friends"), "bot's & friends");
	assert.equal(decodeEntities("&#x2764;"), "❤");
});

test("htmlToMarkdown converts links, emphasis and code spans", () => {
	assert.equal(
		htmlToMarkdown('See <a href="#message">Message</a> for <em>upload_photo</em> details.'),
		"See [Message](https://core.telegram.org/bots/api/#message) for *upload\\_photo* details.",
	);
	assert.equal(htmlToMarkdown("Use <code>@username</code> format."), "Use `@username` format.");
	assert.equal(htmlToMarkdown('<p>One</p><p>Two</p>'), "One\n\nTwo");
});

test("stripTags collapses whitespace and drops tags", () => {
	assert.equal(stripTags("<em>Optional</em>.  Some   text"), "Optional . Some text");
});

test("parseTypeCell: scalars", () => {
	assert.deepEqual(parseTypeCell("Integer"), { type: "integer" });
	assert.deepEqual(parseTypeCell("Float number"), { type: "float" });
	assert.deepEqual(parseTypeCell("String"), { type: "string" });
	assert.deepEqual(parseTypeCell("Boolean"), { type: "bool" });
	assert.deepEqual(parseTypeCell("True"), { type: "bool" });
});

test("parseTypeCell: reference", () => {
	assert.deepEqual(parseTypeCell('<a href="#message">Message</a>'), {
		type: "reference",
		reference: "Message",
	});
});

test("parseTypeCell: array and nested array", () => {
	assert.deepEqual(parseTypeCell('Array of <a href="#messageentity">MessageEntity</a>'), {
		type: "array",
		array: { type: "reference", reference: "MessageEntity" },
	});
	assert.deepEqual(parseTypeCell('Array of Array of <a href="#inlinekeyboardbutton">InlineKeyboardButton</a>'), {
		type: "array",
		array: { type: "array", array: { type: "reference", reference: "InlineKeyboardButton" } },
	});
});

test("parseTypeCell: union", () => {
	assert.deepEqual(parseTypeCell("Integer or String"), {
		type: "any_of",
		any_of: [{ type: "integer" }, { type: "string" }],
	});
	assert.deepEqual(
		parseTypeCell(
			'<a href="#inlinekeyboardmarkup">InlineKeyboardMarkup</a> or <a href="#forcereply">ForceReply</a>',
		),
		{
			type: "any_of",
			any_of: [
				{ type: "reference", reference: "InlineKeyboardMarkup" },
				{ type: "reference", reference: "ForceReply" },
			],
		},
	);
});

test("extractReturnType: reference", () => {
	assert.deepEqual(
		extractReturnType("Use this method to do X. On success, the sent <a href=\"#message\">Message</a> is returned."),
		{ type: "reference", reference: "Message" },
	);
});

test("extractReturnType: array of reference", () => {
	assert.deepEqual(
		extractReturnType("Some description. Returns an Array of <a href=\"#botcommand\">BotCommand</a> objects."),
		{ type: "array", array: { type: "reference", reference: "BotCommand" } },
	);
});

test("extractReturnType: bare True", () => {
	assert.deepEqual(extractReturnType("Do the thing. Returns <em>True</em> on success."), {
		type: "bool",
		default: true,
	});
});

test("extractReturnType: bare scalar (Int/String)", () => {
	assert.deepEqual(extractReturnType("Count the things. Returns <em>Int</em> on success."), {
		type: "integer",
	});
	assert.deepEqual(extractReturnType("Make a link. Returns the link as <em>String</em> on success."), {
		type: "string",
	});
});

test("extractReturnType: union of reference and True", () => {
	assert.deepEqual(
		extractReturnType(
			"On success, if the edited message is not an inline message, the edited " +
				'<a href="#message">Message</a> is returned, otherwise <em>True</em> is returned.',
		),
		{ type: "any_of", any_of: [{ type: "reference", reference: "Message" }, { type: "bool", default: true }] },
	);
});

test("extractReturnType: ignores unrelated lowercase-anchor links containing 'return'", () => {
	assert.deepEqual(
		extractReturnType(
			"the user will not be able to return to the chat using invite links, etc., unless " +
				'<a href="#unbanchatmember">unbanned</a> first. Returns <em>True</em> on success.',
		),
		{ type: "bool", default: true },
	);
});

test("extractEnum finds em-wrapped literal values behind a trigger phrase", () => {
	assert.deepEqual(
		extractEnum(
			"Choose one, depending on what the user is about to receive: <em>typing</em> for text, " +
				"<em>upload_photo</em> for photos.",
		),
		["typing", "upload_photo"],
	);
	assert.equal(extractEnum("A plain description with <em>one</em> emphasis span."), undefined);
});

test("extractEnum reads curly-quoted values and ignores unrelated <em> mentions in a later sentence", () => {
	// regression: Sticker.type used to pick up the *is_animated*/*is_video* field-name
	// mentions from its second sentence instead of the real curly-quoted enum values.
	assert.deepEqual(
		extractEnum(
			"Type of the sticker, currently one of “regular”, “mask”, “custom_emoji”. " +
				"The type of the sticker is independent from its format, which is determined by the fields " +
				"<em>is_animated</em> and <em>is_video</em>.",
		),
		["regular", "mask", "custom_emoji"],
	);
});

test("extractLength parses a N-M characters range", () => {
	assert.deepEqual(extractLength("Text of the message, 1-4096 characters after entities parsing"), {
		min_len: 1,
		max_len: 4096,
	});
	assert.equal(extractLength("No length constraint here"), undefined);
});

const FIXTURE_HTML = `
<h3><a class="anchor" name="recent-changes" href="#recent-changes"><i class="anchor-icon"></i></a>Recent changes</h3>
<h4><a class="anchor" name="june-11-2026" href="#june-11-2026"><i class="anchor-icon"></i></a>June 11, 2026</h4>
<p><strong>Bot API 10.1</strong></p>

<h4><a class="anchor" name="getme" href="#getme"><i class="anchor-icon"></i></a>getMe</h4>
<p>A simple method for testing your bot's authentication token. Returns basic information about the bot in form of a <a href="#user">User</a> object.</p>

<h4><a class="anchor" name="sendchataction" href="#sendchataction"><i class="anchor-icon"></i></a>sendChatAction</h4>
<p>Tell the user something is happening. Returns <em>True</em> on success.</p>
<table class="table">
<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody>
<tr><td>chat_id</td><td>Integer or String</td><td>Yes</td><td>Unique identifier for the target chat</td></tr>
<tr><td>action</td><td>String</td><td>Yes</td><td>Choose one, depending on what the user is about to receive: <em>typing</em> for text, <em>upload_photo</em> for photos.</td></tr>
</tbody>
</table>

<h4><a class="anchor" name="user" href="#user"><i class="anchor-icon"></i></a>User</h4>
<p>This object represents a Telegram user.</p>
<table class="table">
<thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
<tbody>
<tr><td>id</td><td>Integer</td><td>Unique identifier for this user</td></tr>
<tr><td>username</td><td>String</td><td><em>Optional</em>. User's username</td></tr>
</tbody>
</table>

<h4><a class="anchor" name="maybeinaccessiblemessage" href="#maybeinaccessiblemessage"><i class="anchor-icon"></i></a>MaybeInaccessibleMessage</h4>
<p>This object describes a message that can be inaccessible to the bot. It can be one of</p>
<ul>
<li><a href="#message">Message</a></li>
<li><a href="#inaccessiblemessage">InaccessibleMessage</a></li>
</ul>

<h4><a class="anchor" name="callbackgame" href="#callbackgame"><i class="anchor-icon"></i></a>CallbackGame</h4>
<p>A placeholder, currently holds no information.</p>
`;

test("parseSchema: end-to-end fixture", () => {
	const schema = parseSchema(FIXTURE_HTML);

	assert.deepEqual(schema.version, { major: 10, minor: 1, patch: 0 });
	assert.deepEqual(schema.recent_changes, { year: 2026, month: 6, day: 11 });

	assert.equal(schema.methods.length, 2);
	assert.equal(schema.objects.length, 3);

	const getMe = schema.methods.find((m) => m.name === "getMe");
	assert.equal(getMe.arguments, undefined);
	assert.deepEqual(getMe.return_type, { type: "reference", reference: "User" });

	const sendChatAction = schema.methods.find((m) => m.name === "sendChatAction");
	assert.deepEqual(sendChatAction.return_type, { type: "bool", default: true });
	const action = sendChatAction.arguments.find((a) => a.name === "action");
	assert.equal(action.required, true);
	assert.deepEqual(action.enum, ["typing", "upload_photo"]);
	const chatId = sendChatAction.arguments.find((a) => a.name === "chat_id");
	assert.deepEqual(chatId, {
		name: "chat_id",
		description: "Unique identifier for the target chat",
		required: true,
		type: "any_of",
		any_of: [{ type: "integer" }, { type: "string" }],
	});

	const user = schema.objects.find((o) => o.name === "User");
	assert.equal(user.type, "properties");
	const id = user.properties.find((p) => p.name === "id");
	assert.equal(id.required, true);
	const username = user.properties.find((p) => p.name === "username");
	assert.equal(username.required, false);
	assert.equal(username.description, "*Optional*. User's username");

	const union = schema.objects.find((o) => o.name === "MaybeInaccessibleMessage");
	assert.equal(union.type, "any_of");
	assert.deepEqual(union.any_of, [
		{ type: "reference", reference: "Message" },
		{ type: "reference", reference: "InaccessibleMessage" },
	]);

	const marker = schema.objects.find((o) => o.name === "CallbackGame");
	assert.equal(marker.properties, undefined);
	assert.equal(marker.any_of, undefined);
});

test("parseVersion throws a clear error when the changelog section is missing", () => {
	assert.throws(() => parseVersion("<html><body>nothing here</body></html>"), /Recent changes/);
});
