// `inline_message_id` — what `chosen_inline_result` / inline-message callbacks carry and the
// edit methods take — is a TL-serialized MTProto `InputBotInlineMessageID` behind url-safe
// base64, no RLE and no constructor id. the byte length tells the two layouts apart:
//
//   inputBotInlineMessageID   (20 bytes): dc_id:int  id:long                access_hash:long
//   inputBotInlineMessageID64 (24 bytes): dc_id:int  owner_id:long  id:int  access_hash:long
//
// in the legacy layout `id` packs a 32-bit owner (chat) id in its high half and the message id
// in its low half. that owner id is an mtproto peer id, not a bot api `chat.id` (no `-100…`).

import { BinaryReader, BinaryWriter, base64urlDecode, base64urlEncode } from "./encoding.js";
import { FileIdParseError } from "./errors.js";

/** the legacy 20-byte layout — owner and message id packed into one `long`. */
export interface LegacyInlineMessageId {
	kind: "legacy";
	/** data center the message lives on. */
	dcId: number;
	/** the packed `long`: owner id in the high 32 bits, message id in the low 32. */
	id: bigint;
	accessHash: bigint;
}

/** the 24-byte layout for 64-bit owner ids. */
export interface ModernInlineMessageId {
	kind: "modern";
	dcId: number;
	/** the mtproto peer id the message belongs to. */
	ownerId: bigint;
	messageId: number;
	accessHash: bigint;
}

export type ParsedInlineMessageId = LegacyInlineMessageId | ModernInlineMessageId;

export const isLegacyInlineMessageId = (id: ParsedInlineMessageId): id is LegacyInlineMessageId =>
	id.kind === "legacy";
export const isModernInlineMessageId = (id: ParsedInlineMessageId): id is ModernInlineMessageId =>
	id.kind === "modern";

const LEGACY_LENGTH = 20;
const MODERN_LENGTH = 24;

/** decode an `inline_message_id` string. throws {@link FileIdParseError} on anything else. */
export function parseInlineMessageId(input: string): ParsedInlineMessageId {
	let bytes: Uint8Array;
	try {
		bytes = base64urlDecode(input);
	} catch (error) {
		throw new FileIdParseError(
			`inline_message_id: ${error instanceof Error ? error.message : String(error)}`,
			input,
		);
	}

	const reader = new BinaryReader(bytes);
	if (bytes.byteLength === LEGACY_LENGTH) {
		return {
			kind: "legacy",
			dcId: reader.readInt32(),
			id: reader.readInt64(),
			accessHash: reader.readInt64(),
		};
	}

	if (bytes.byteLength === MODERN_LENGTH) {
		return {
			kind: "modern",
			dcId: reader.readInt32(),
			ownerId: reader.readInt64(),
			messageId: reader.readInt32(),
			accessHash: reader.readInt64(),
		};
	}

	throw new FileIdParseError(
		`inline_message_id: expected ${LEGACY_LENGTH} or ${MODERN_LENGTH} bytes, got ${bytes.byteLength}`,
		input,
	);
}

/** encode a parsed id back to the exact `inline_message_id` string telegram issued. */
export function serializeInlineMessageId(parsed: ParsedInlineMessageId): string {
	const writer = new BinaryWriter();
	writer.writeInt32(parsed.dcId);

	if (parsed.kind === "legacy") {
		writer.writeInt64(parsed.id);
	} else {
		writer.writeInt64(parsed.ownerId);
		writer.writeInt32(parsed.messageId);
	}

	writer.writeInt64(parsed.accessHash);
	return base64urlEncode(writer.toBytes());
}

/**
 * an `inline_message_id`, decoded. which data center serves the message, its message id and
 * owner — without an api call. `toString()` round-trips to the original string.
 *
 * ```ts
 * const id = InlineMessageId.from(ctx.chosenInlineResult.inline_message_id);
 * id.dcId;      // 2
 * id.messageId; // 4096
 * ```
 */
export class InlineMessageId {
	readonly raw: ParsedInlineMessageId;

	constructor(raw: ParsedInlineMessageId) {
		this.raw = raw;
	}

	static from(input: string): InlineMessageId {
		return new InlineMessageId(parseInlineMessageId(input));
	}

	get kind(): ParsedInlineMessageId["kind"] {
		return this.raw.kind;
	}

	get dcId(): number {
		return this.raw.dcId;
	}

	get accessHash(): bigint {
		return this.raw.accessHash;
	}

	/** the message id — the low half of the packed `id` in the legacy layout. */
	get messageId(): number {
		return this.raw.kind === "legacy" ? Number(BigInt.asIntN(32, this.raw.id)) : this.raw.messageId;
	}

	/**
	 * the mtproto owner (peer) id — the high half of the packed `id` in the legacy layout.
	 * not a bot api `chat.id`: groups and channels lack the `-100` prefix here.
	 */
	get ownerId(): bigint {
		return this.raw.kind === "legacy" ? this.raw.id >> 32n : this.raw.ownerId;
	}

	toString(): string {
		return serializeInlineMessageId(this.raw);
	}
}
