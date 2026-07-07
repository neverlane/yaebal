import { FILE_TYPE_TO_UNIQUE, FileUniqueType } from "./constants.js";
import {
	BinaryReader,
	BinaryWriter,
	base64urlDecode,
	base64urlEncode,
	packTlString,
	rleDecode,
	rleEncode,
	unpackTlString,
} from "./encoding.js";
import { FileIdParseError } from "./errors.js";
import type { ParsedFileId } from "./file-id.js";

export interface WebFileUniqueId {
	kind: "web";
	source: string;
	url: string;
}

export interface PhotoFileUniqueId {
	kind: "photo";
	source: string;
	volumeId: bigint;
	localId: number;
}

export interface DocumentFileUniqueId {
	kind: "document";
	source: string;
	id: bigint;
}

export interface SecureFileUniqueId {
	kind: "secure";
	source: string;
	id: bigint;
}

export interface EncryptedFileUniqueId {
	kind: "encrypted";
	source: string;
	id: bigint;
}

export interface TempFileUniqueId {
	kind: "temp";
	source: string;
	id: bigint;
}

export type ParsedFileUniqueId =
	| WebFileUniqueId
	| PhotoFileUniqueId
	| DocumentFileUniqueId
	| SecureFileUniqueId
	| EncryptedFileUniqueId
	| TempFileUniqueId;

// -- guards ---------------------------------------------------------------------------------

export const isWebUniqueId = (u: ParsedFileUniqueId): u is WebFileUniqueId => u.kind === "web";
export const isPhotoUniqueId = (u: ParsedFileUniqueId): u is PhotoFileUniqueId =>
	u.kind === "photo";
export const isDocumentUniqueId = (u: ParsedFileUniqueId): u is DocumentFileUniqueId =>
	u.kind === "document";
export const isSecureUniqueId = (u: ParsedFileUniqueId): u is SecureFileUniqueId =>
	u.kind === "secure";
export const isEncryptedUniqueId = (u: ParsedFileUniqueId): u is EncryptedFileUniqueId =>
	u.kind === "encrypted";
export const isTempUniqueId = (u: ParsedFileUniqueId): u is TempFileUniqueId => u.kind === "temp";

// -- parse ----------------------------------------------------------------------------------

// some unique_ids in the wild were rle-encoded with trailing zero bytes dropped;
// pad to the expected width so the readers don't fall off the end
function padTrailingZeros(decoded: Uint8Array): Uint8Array {
	if (decoded.byteLength < 4) return decoded;

	const typeId = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength).getInt32(
		0,
		true,
	);
	const expected =
		typeId === FileUniqueType.Photo ? 16 : typeId === FileUniqueType.Web ? decoded.byteLength : 12;

	if (decoded.byteLength >= expected) return decoded;

	const padded = new Uint8Array(expected);
	padded.set(decoded);

	return padded;
}

/** decode a `file_unique_id` string into its {@link ParsedFileUniqueId}. */
export function parseFileUniqueId(input: string): ParsedFileUniqueId {
	const decoded = padTrailingZeros(rleDecode(base64urlDecode(input)));

	if (decoded.byteLength < 4) throw new FileIdParseError("file_unique_id too short", input);

	const reader = new BinaryReader(decoded);
	const typeId = reader.readInt32();

	switch (typeId) {
		case FileUniqueType.Web:
			return {
				kind: "web",
				source: input,
				url: new TextDecoder().decode(unpackTlString(reader)),
			};

		case FileUniqueType.Photo: {
			const volumeId = reader.readInt64();
			const localId = reader.readInt32();

			return { kind: "photo", source: input, volumeId, localId };
		}

		case FileUniqueType.Document:
			return { kind: "document", source: input, id: reader.readInt64() };

		case FileUniqueType.Secure:
			return { kind: "secure", source: input, id: reader.readInt64() };

		case FileUniqueType.Encrypted:
			return { kind: "encrypted", source: input, id: reader.readInt64() };

		case FileUniqueType.Temp:
			return { kind: "temp", source: input, id: reader.readInt64() };

		default:
			throw new FileIdParseError(`unknown file_unique_id type ${typeId}`, input);
	}
}

// -- serialize ------------------------------------------------------------------------------

/** re-encode a {@link ParsedFileUniqueId} to the wire string. */
export function serializeFileUniqueId(unique: ParsedFileUniqueId): string {
	const writer = new BinaryWriter();

	switch (unique.kind) {
		case "web":
			writer.writeInt32(FileUniqueType.Web);
			packTlString(writer, new TextEncoder().encode(unique.url));
			break;

		case "photo":
			writer.writeInt32(FileUniqueType.Photo);
			writer.writeInt64(unique.volumeId);
			writer.writeInt32(unique.localId);
			break;

		case "document":
			writer.writeInt32(FileUniqueType.Document);
			writer.writeInt64(unique.id);
			break;

		case "secure":
			writer.writeInt32(FileUniqueType.Secure);
			writer.writeInt64(unique.id);
			break;

		case "encrypted":
			writer.writeInt32(FileUniqueType.Encrypted);
			writer.writeInt64(unique.id);
			break;

		case "temp":
			writer.writeInt32(FileUniqueType.Temp);
			writer.writeInt64(unique.id);
			break;
	}

	return base64urlEncode(rleEncode(writer.toBytes()));
}

// -- derive from a full file_id -------------------------------------------------------------

/**
 * derive the matching `file_unique_id` payload from a parsed `file_id` — same
 * `file_unique_id` ⇒ same underlying file, across bots and across time.
 */
export function fileUniqueIdFromFileId(file: ParsedFileId): ParsedFileUniqueId {
	if (file.kind === "web") return { kind: "web", source: "", url: file.url };

	const unique = FILE_TYPE_TO_UNIQUE.get(file.fileType);
	if (unique === undefined) {
		throw new FileIdParseError(`no unique_id mapping for file type ${file.fileType}`);
	}

	switch (unique) {
		case FileUniqueType.Photo: {
			if (file.kind !== "photo") {
				throw new FileIdParseError("expected a photo file_id for a photo unique_id");
			}

			// pre-32 photos carried volume_id/local_id; modern ones don't — fall back to the
			// outer file id (stable on our side, though not byte-equal to TDLib's output)
			const ps = file.photoSize;
			const volumeId = "volumeId" in ps && ps.volumeId !== undefined ? ps.volumeId : file.id;
			const localId = "localId" in ps && ps.localId !== undefined ? ps.localId : 0;

			return { kind: "photo", source: "", volumeId, localId };
		}

		case FileUniqueType.Document:
			return { kind: "document", source: "", id: file.id };

		case FileUniqueType.Secure:
			return { kind: "secure", source: "", id: file.id };

		case FileUniqueType.Encrypted:
			return { kind: "encrypted", source: "", id: file.id };

		case FileUniqueType.Temp:
			return { kind: "temp", source: "", id: file.id };

		default:
			throw new FileIdParseError(`web unique_id cannot come from a non-web file_id`);
	}
}

// -- class wrapper --------------------------------------------------------------------------

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * an object view over a parsed `file_unique_id`. `FileUniqueId.from(string)` parses;
 * `.raw` is the discriminated union; `.toString()` re-serializes.
 */
export class FileUniqueId {
	readonly raw: ParsedFileUniqueId;

	constructor(raw: ParsedFileUniqueId) {
		this.raw = raw;
	}

	static from(fileUniqueId: string): FileUniqueId {
		return new FileUniqueId(parseFileUniqueId(fileUniqueId));
	}

	get kind(): ParsedFileUniqueId["kind"] {
		return this.raw.kind;
	}

	get source(): string {
		return this.raw.source;
	}

	/** the file's server id — every kind except `web` and `photo`. */
	get id(): bigint | undefined {
		return this.raw.kind === "web" || this.raw.kind === "photo" ? undefined : this.raw.id;
	}

	/** the remote url — `web` only. */
	get url(): string | undefined {
		return this.raw.kind === "web" ? this.raw.url : undefined;
	}

	/** the storage volume — `photo` only. */
	get volumeId(): bigint | undefined {
		return this.raw.kind === "photo" ? this.raw.volumeId : undefined;
	}

	/** the id within the volume — `photo` only. */
	get localId(): number | undefined {
		return this.raw.kind === "photo" ? this.raw.localId : undefined;
	}

	toString(): string {
		return serializeFileUniqueId(this.raw);
	}

	[INSPECT](_depth: number, _options: unknown, inspect: (v: unknown) => string): string {
		return `FileUniqueId ${inspect(this.raw)}`;
	}
}
