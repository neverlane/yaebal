import {
	FILE_REFERENCE_FLAG,
	FileType,
	MAX_SUPPORTED_VERSION,
	WEB_LOCATION_FLAG,
} from "./constants.js";
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
import { FileIdParseError, UnsupportedFileIdVersionError } from "./errors.js";
import { FileUniqueId, fileUniqueIdFromFileId } from "./file-unique-id.js";
import {
	type PhotoSizeSource,
	parsePhotoSizeSource,
	serializePhotoSizeSource,
} from "./photo-size-source.js";

interface BaseFileId {
	/** the original string this was parsed from (empty for hand-built values). */
	source: string;
	/** file_id format major version. */
	version: number;
	/** format minor version (only meaningful when `version === 4`). */
	subVersion: number;
	fileType: FileType;
	/** the telegram datacenter the file lives on (1..5). */
	dcId: number;
	/** the server-issued proof of access; present on freshly issued ids. */
	fileReference?: Uint8Array;
}

export interface PhotoFileId extends BaseFileId {
	kind: "photo";
	id: bigint;
	accessHash: bigint;
	photoSize: PhotoSizeSource;
}

export interface DocumentFileId extends BaseFileId {
	kind: "document";
	id: bigint;
	accessHash: bigint;
}

export interface WebFileId extends BaseFileId {
	kind: "web";
	url: string;
	accessHash: bigint;
}

export type ParsedFileId = PhotoFileId | DocumentFileId | WebFileId;

// -- guards ---------------------------------------------------------------------------------

export const isPhotoFileId = (file: ParsedFileId): file is PhotoFileId => file.kind === "photo";
export const isDocumentFileId = (file: ParsedFileId): file is DocumentFileId =>
	file.kind === "document";
export const isWebFileId = (file: ParsedFileId): file is WebFileId => file.kind === "web";
export const isStickerFileId = (file: ParsedFileId): file is DocumentFileId =>
	file.kind === "document" && file.fileType === FileType.Sticker;

// -- parse ----------------------------------------------------------------------------------

const isPhotoType = (t: number): boolean =>
	t === FileType.Thumbnail || t === FileType.ProfilePhoto || t === FileType.Photo;

/** decode a `file_id` string into its {@link ParsedFileId}. */
export function parseFileId(input: string): ParsedFileId {
	const decoded = rleDecode(base64urlDecode(input));

	if (decoded.byteLength < 2) throw new FileIdParseError("file_id too short", input);

	// the version is the last byte; sub_version (version 4 only) sits right before it
	const version = decoded[decoded.byteLength - 1] as number;
	const subVersion = version === 4 ? (decoded[decoded.byteLength - 2] as number) : 0;

	if (version > MAX_SUPPORTED_VERSION) throw new UnsupportedFileIdVersionError(version, subVersion);

	const payloadEnd = decoded.byteLength - (version === 4 ? 2 : 1);
	const reader = new BinaryReader(decoded.subarray(0, payloadEnd));

	const rawTypeId = reader.readUint32();
	const hasWebLocation = (rawTypeId & WEB_LOCATION_FLAG) !== 0;
	const hasFileReference = (rawTypeId & FILE_REFERENCE_FLAG) !== 0;
	const fileType = (rawTypeId & ~WEB_LOCATION_FLAG & ~FILE_REFERENCE_FLAG) as FileType;

	if (fileType >= FileType.None) {
		throw new FileIdParseError(`unknown file type ${fileType}`, input);
	}

	const dcId = reader.readUint32();
	const fileReference = hasFileReference ? unpackTlString(reader) : undefined;

	const base = {
		source: input,
		version,
		subVersion,
		fileType,
		dcId,
		...(fileReference !== undefined ? { fileReference } : {}),
	};

	if (hasWebLocation) {
		const url = new TextDecoder().decode(unpackTlString(reader));
		const accessHash = reader.readInt64();

		return { kind: "web", ...base, url, accessHash };
	}

	const id = reader.readInt64();
	const accessHash = reader.readInt64();

	if (isPhotoType(fileType)) {
		return {
			kind: "photo",
			...base,
			id,
			accessHash,
			photoSize: parsePhotoSizeSource(reader, version, subVersion),
		};
	}

	return { kind: "document", ...base, id, accessHash };
}

// -- serialize ------------------------------------------------------------------------------

/** re-encode a {@link ParsedFileId} to the wire string. parse → serialize round-trips bytes. */
export function serializeFileId(file: ParsedFileId): string {
	const writer = new BinaryWriter();

	let typeId: number = file.fileType;
	if (file.fileReference !== undefined) typeId |= FILE_REFERENCE_FLAG;
	if (file.kind === "web") typeId |= WEB_LOCATION_FLAG;

	writer.writeUint32(typeId >>> 0);
	writer.writeUint32(file.dcId);

	if (file.fileReference !== undefined) packTlString(writer, file.fileReference);

	if (file.kind === "web") {
		packTlString(writer, new TextEncoder().encode(file.url));
		writer.writeInt64(file.accessHash);
	} else {
		writer.writeInt64(file.id);
		writer.writeInt64(file.accessHash);

		if (file.kind === "photo") {
			if (!isPhotoType(file.fileType)) {
				throw new FileIdParseError(
					`a photo file_id needs a Thumbnail/ProfilePhoto/Photo file type, got ${file.fileType}`,
				);
			}

			serializePhotoSizeSource(writer, file.photoSize, file.version, file.subVersion);
		}
	}

	if (file.version >= 4) writer.writeUint8(file.subVersion);
	writer.writeUint8(file.version);

	return base64urlEncode(rleEncode(writer.toBytes()));
}

// -- class wrapper --------------------------------------------------------------------------

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * an object view over a parsed `file_id`. `FileId.from(string)` parses; the getters
 * surface the common fields; `.raw` is the full discriminated union for narrowing
 * (`isPhotoFileId(file.raw)` & co); `.toString()` re-serializes; `.toUniqueId()`
 * derives the matching `file_unique_id`.
 */
export class FileId {
	readonly raw: ParsedFileId;

	constructor(raw: ParsedFileId) {
		this.raw = raw;
	}

	static from(fileId: string): FileId {
		return new FileId(parseFileId(fileId));
	}

	get kind(): ParsedFileId["kind"] {
		return this.raw.kind;
	}

	get fileType(): FileType {
		return this.raw.fileType;
	}

	get version(): number {
		return this.raw.version;
	}

	get subVersion(): number {
		return this.raw.subVersion;
	}

	get dcId(): number {
		return this.raw.dcId;
	}

	get accessHash(): bigint {
		return this.raw.accessHash;
	}

	get source(): string {
		return this.raw.source;
	}

	get fileReference(): Uint8Array | undefined {
		return this.raw.fileReference;
	}

	get hasReference(): boolean {
		return this.raw.fileReference !== undefined;
	}

	get hasWebLocation(): boolean {
		return this.raw.kind === "web";
	}

	/** the file's server id — photos and documents only. */
	get id(): bigint | undefined {
		return this.raw.kind === "web" ? undefined : this.raw.id;
	}

	/** where the photo size came from — photos only. */
	get photoSize(): PhotoSizeSource | undefined {
		return this.raw.kind === "photo" ? this.raw.photoSize : undefined;
	}

	/** the remote url — web file_ids only. */
	get url(): string | undefined {
		return this.raw.kind === "web" ? this.raw.url : undefined;
	}

	toString(): string {
		return serializeFileId(this.raw);
	}

	/** derive the matching `file_unique_id` — dedupe key that survives forwards and bot changes. */
	toUniqueId(): FileUniqueId {
		return new FileUniqueId(fileUniqueIdFromFileId(this.raw));
	}

	[INSPECT](_depth: number, _options: unknown, inspect: (v: unknown) => string): string {
		return `FileId ${inspect(this.raw)}`;
	}
}
