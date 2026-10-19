import assert from "node:assert/strict";
import test from "node:test";
import {
	BinaryWriter,
	base64urlEncode,
	FileIdParseError,
	InlineMessageId,
	isLegacyInlineMessageId,
	parseInlineMessageId,
} from "./index.js";

/** bytes laid out exactly like an mtproto inputBotInlineMessageID / …64, then base64url'd. */
function encode(fields: ["int" | "long", number | bigint][]): string {
	const writer = new BinaryWriter();
	for (const [type, value] of fields) {
		if (type === "int") writer.writeInt32(value as number);
		else writer.writeInt64(value as bigint);
	}
	return base64urlEncode(writer.toBytes());
}

test("legacy ids split the packed long into owner and message id", { timeout: 5_000 }, () => {
	const packed = (-1234n << 32n) + 4096n;
	const raw = encode([
		["int", 2],
		["long", packed],
		["long", -77n],
	]);

	const id = InlineMessageId.from(raw);
	assert.equal(id.kind, "legacy");
	assert.equal(id.dcId, 2);
	assert.equal(id.messageId, 4096);
	assert.equal(id.ownerId, -1234n);
	assert.equal(id.accessHash, -77n);
	assert.equal(id.toString(), raw, "round-trips to the exact string");
	assert.ok(isLegacyInlineMessageId(parseInlineMessageId(raw)));
});

test("modern ids carry a 64-bit owner and a separate message id", { timeout: 5_000 }, () => {
	const raw = encode([
		["int", 4],
		["long", 7_000_000_000n],
		["int", 15],
		["long", 123456789n],
	]);

	const id = InlineMessageId.from(raw);
	assert.equal(id.kind, "modern");
	assert.equal(id.dcId, 4);
	assert.equal(id.ownerId, 7_000_000_000n);
	assert.equal(id.messageId, 15);
	assert.equal(id.toString(), raw);
});

test("anything but 20 or 24 bytes is rejected", { timeout: 5_000 }, () => {
	assert.throws(() => parseInlineMessageId(encode([["int", 1]])), FileIdParseError);
	assert.throws(() => parseInlineMessageId("not*base64"), FileIdParseError);
});
