import assert from "node:assert/strict";
import test from "node:test";
import {
	base64urlDecode,
	base64urlEncode,
	FileId,
	FileIdParseError,
	FileType,
	FileUniqueId,
	isDocumentFileId,
	isPhotoFileId,
	isStickerFileId,
	parseFileId,
	rleDecode,
	rleEncode,
	serializeFileId,
	UnsupportedFileIdVersionError,
} from "./index.js";

// real-world file_ids across every format era this parser supports
const FIXTURES = {
	STICKER_V2: "CAADBAADwwADmFmqDf6xBrPTReqHAg",
	STICKER_V4_22: "CAADBAADwwADmFmqDf6xBrPTReqHFgQ",
	STICKER_V4_27: "CAACAgIAAxkBAAIEol9yQhBqFnT4HXldAh31a-hYXuDIAAIECwACAoujAAFFn1sl9AABHbkbBA",
	PHOTO_V2: "AgADAgADRaoxG64rCUlfm3fj3nihW3PHUQ8ABA0Pma0G3xt2bLABAAEC",
	PHOTO_V4_22: "AgADAgADRaoxG64rCUlfm3fj3nihW3PHUQ8ABAEAAwIAA3gAA2uwAQABFgQ",
	PHOTO_V4_30:
		"AgACAgIAAxkBAAIE2F-nHvTX7tX2Hg946DOPJWEahhgUAAI1sDEbClw4SX8n9AqBZEu9FpVJli4AAwEAAwIAA3gAA-YMBAABHgQ",
	STICKER_OLD: "CAADAQADegAD997LEUiQZafDlhIeAg",
	STICKER_NEW: "CAACAgEAAx0CVgtngQACAuFfU1GY9wiRG7A7jlIBbP2yvAostAACegAD997LEUiQZafDlhIeGwQ",
} as const;

// ---- encoding primitives ------------------------------------------------------------------

test("base64url round-trips arbitrary bytes", () => {
	for (const bytes of [
		new Uint8Array([]),
		new Uint8Array([0]),
		new Uint8Array([1, 2, 3]),
		new Uint8Array([255, 254, 0, 0, 128]),
		new Uint8Array(Array.from({ length: 100 }, (_, i) => i * 7).map((n) => n % 256)),
	]) {
		assert.deepEqual([...base64urlDecode(base64urlEncode(bytes))], [...bytes]);
	}
});

test("base64url rejects invalid characters", () => {
	assert.throws(() => base64urlDecode("ab+/cd"), FileIdParseError);
});

test("rle round-trips and actually compresses zero runs", () => {
	const bytes = new Uint8Array([1, 0, 0, 0, 0, 5, 0, 2]);
	const encoded = rleEncode(bytes);

	assert.deepEqual([...encoded], [1, 0, 4, 5, 0, 1, 2]);
	assert.deepEqual([...rleDecode(encoded)], [...bytes]);
});

// ---- parsing ------------------------------------------------------------------------------

test("parses a v2 sticker as a document", () => {
	const file = parseFileId(FIXTURES.STICKER_V2);

	assert.ok(isDocumentFileId(file));
	assert.ok(isStickerFileId(file));
	assert.equal(file.fileType, FileType.Sticker);
	assert.equal(file.version, 2);
	assert.equal(file.subVersion, 0);
	assert.equal(file.dcId, 4);
	assert.equal(typeof file.accessHash, "bigint");
	assert.equal(file.fileReference, undefined);
});

test("parses a modern sticker with a file reference", () => {
	const file = parseFileId(FIXTURES.STICKER_V4_27);

	assert.ok(isStickerFileId(file));
	assert.equal(file.version, 4);
	assert.equal(file.subVersion, 27);
	assert.ok(file.fileReference instanceof Uint8Array);
	assert.ok(file.fileReference.byteLength > 0);
});

test("parses photos of every era with the right photo size source", () => {
	const v2 = parseFileId(FIXTURES.PHOTO_V2);
	assert.ok(isPhotoFileId(v2));
	assert.equal(v2.photoSize.type, "legacy"); // implicit pre-22 layout

	const v22 = parseFileId(FIXTURES.PHOTO_V4_22);
	assert.ok(isPhotoFileId(v22));
	assert.equal(v22.photoSize.type, "thumbnail");
	assert.ok("volumeId" in v22.photoSize && v22.photoSize.volumeId !== undefined); // outer volume_id era

	const v30 = parseFileId(FIXTURES.PHOTO_V4_30);
	assert.ok(isPhotoFileId(v30));
	assert.equal(v30.photoSize.type, "thumbnail");
	if (v30.photoSize.type === "thumbnail") assert.equal(v30.photoSize.thumbnailType, "x");
});

test("same file across eras keeps its identity (id, dc)", () => {
	const oldSticker = parseFileId(FIXTURES.STICKER_OLD);
	const newSticker = parseFileId(FIXTURES.STICKER_NEW);

	assert.ok(isDocumentFileId(oldSticker) && isDocumentFileId(newSticker));
	assert.equal(oldSticker.id, newSticker.id);
	assert.equal(oldSticker.accessHash, newSticker.accessHash);
	assert.equal(oldSticker.dcId, newSticker.dcId);
});

test("malformed input throws FileIdParseError", () => {
	for (const junk of [
		"",
		"AA",
		"definitely not a file id!!!",
		base64urlEncode(new Uint8Array([1])),
	]) {
		assert.throws(
			() => parseFileId(junk),
			(e: unknown) => e instanceof FileIdParseError || e instanceof UnsupportedFileIdVersionError,
		);
	}
});

test("a future format version throws UnsupportedFileIdVersionError", () => {
	// craft: any payload with last byte = 9 (version 9 doesn't exist yet)
	const crafted = base64urlEncode(rleEncode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9])));

	assert.throws(
		() => parseFileId(crafted),
		(e: unknown) => e instanceof UnsupportedFileIdVersionError && e.version === 9,
	);
});

// ---- serialization ------------------------------------------------------------------------

test("parse → serialize round-trips every fixture byte-for-byte", () => {
	for (const [name, fileId] of Object.entries(FIXTURES)) {
		assert.equal(serializeFileId(parseFileId(fileId)), fileId, name);
	}
});

// ---- FileId class -------------------------------------------------------------------------

test("FileId.from exposes the common fields and round-trips via toString", () => {
	const file = FileId.from(FIXTURES.PHOTO_V4_30);

	assert.equal(file.kind, "photo");
	assert.equal(file.fileType, FileType.Photo);
	assert.equal(file.version, 4);
	assert.equal(file.hasReference, true);
	assert.equal(file.hasWebLocation, false);
	assert.equal(typeof file.id, "bigint");
	assert.equal(file.url, undefined);
	assert.ok(file.photoSize);
	assert.equal(file.toString(), FIXTURES.PHOTO_V4_30);
});

test("toUniqueId derives a stable dedupe key", () => {
	const oldSticker = FileId.from(FIXTURES.STICKER_OLD);
	const newSticker = FileId.from(FIXTURES.STICKER_NEW);

	// same underlying file → same unique id, even across format eras
	assert.equal(oldSticker.toUniqueId().toString(), newSticker.toUniqueId().toString());

	const unique = oldSticker.toUniqueId();
	assert.equal(unique.kind, "document");
	assert.equal(unique.id, oldSticker.id);
});

// ---- FileUniqueId -------------------------------------------------------------------------

test("FileUniqueId round-trips its own serialization", () => {
	const derived = FileId.from(FIXTURES.STICKER_V4_27).toUniqueId();
	const reparsed = FileUniqueId.from(derived.toString());

	assert.equal(reparsed.kind, "document");
	assert.equal(reparsed.id, derived.id);
	assert.equal(reparsed.toString(), derived.toString());
});

test("photo unique ids carry volume/local ids", () => {
	const unique = FileId.from(FIXTURES.PHOTO_V4_22).toUniqueId();

	assert.equal(unique.kind, "photo");
	assert.equal(typeof unique.volumeId, "bigint");
	assert.equal(typeof unique.localId, "number");

	const reparsed = FileUniqueId.from(unique.toString());
	assert.equal(reparsed.volumeId, unique.volumeId);
	assert.equal(reparsed.localId, unique.localId);
});
