// photos carry a photo_size_source describing where the size came from. the binary
// layout went through three eras, keyed by the file_id's sub_version:
//   < 22 ("AddPhotoSizeSource")            — implicit { volume_id, secret, local_id }
//   22..31                                  — outer volume_id + tagged variant + outer local_id
//   >= 32 ("RemovePhotoVolumeAndLocalId")   — tagged variant carries everything

import {
	type FileType,
	PhotoSizeSourceType,
	VERSION_ADD_PHOTO_SIZE_SOURCE,
	VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID,
} from "./constants.js";
import type { BinaryReader, BinaryWriter } from "./encoding.js";
import { FileIdParseError } from "./errors.js";

// pre-32 photos carried volume_id/local_id outside the variant; modern file_ids drop
// them — hence optional on the variants that don't carry their own.

export interface LegacyPhotoSizeSource {
	type: "legacy";
	volumeId?: bigint;
	secret: bigint;
	localId: number;
}

export interface ThumbnailPhotoSizeSource {
	type: "thumbnail";
	volumeId?: bigint;
	fileType: FileType;
	/** the size letter telegram assigns: `"s"`, `"m"`, `"x"`, `"y"`, … */
	thumbnailType: string;
	localId?: number;
}

export interface DialogPhotoSmallPhotoSizeSource {
	type: "dialog_photo_small";
	volumeId?: bigint;
	dialogId: bigint;
	dialogAccessHash: bigint;
	localId?: number;
}

export interface DialogPhotoBigPhotoSizeSource {
	type: "dialog_photo_big";
	volumeId?: bigint;
	dialogId: bigint;
	dialogAccessHash: bigint;
	localId?: number;
}

export interface StickerSetThumbnailPhotoSizeSource {
	type: "sticker_set_thumbnail";
	volumeId?: bigint;
	stickerSetId: bigint;
	stickerSetAccessHash: bigint;
	localId?: number;
}

export interface FullLegacyPhotoSizeSource {
	type: "full_legacy";
	volumeId: bigint;
	secret: bigint;
	localId: number;
}

export interface DialogPhotoSmallLegacyPhotoSizeSource {
	type: "dialog_photo_small_legacy";
	dialogId: bigint;
	dialogAccessHash: bigint;
	volumeId: bigint;
	localId: number;
}

export interface DialogPhotoBigLegacyPhotoSizeSource {
	type: "dialog_photo_big_legacy";
	dialogId: bigint;
	dialogAccessHash: bigint;
	volumeId: bigint;
	localId: number;
}

export interface StickerSetThumbnailLegacyPhotoSizeSource {
	type: "sticker_set_thumbnail_legacy";
	stickerSetId: bigint;
	stickerSetAccessHash: bigint;
	volumeId: bigint;
	localId: number;
}

export interface StickerSetThumbnailVersionPhotoSizeSource {
	type: "sticker_set_thumbnail_version";
	stickerSetId: bigint;
	stickerSetAccessHash: bigint;
	version: number;
}

export type PhotoSizeSource =
	| LegacyPhotoSizeSource
	| ThumbnailPhotoSizeSource
	| DialogPhotoSmallPhotoSizeSource
	| DialogPhotoBigPhotoSizeSource
	| StickerSetThumbnailPhotoSizeSource
	| FullLegacyPhotoSizeSource
	| DialogPhotoSmallLegacyPhotoSizeSource
	| DialogPhotoBigLegacyPhotoSizeSource
	| StickerSetThumbnailLegacyPhotoSizeSource
	| StickerSetThumbnailVersionPhotoSizeSource;

// -- guards ---------------------------------------------------------------------------------

export const isLegacySource = (s: PhotoSizeSource): s is LegacyPhotoSizeSource =>
	s.type === "legacy";
export const isThumbnailSource = (s: PhotoSizeSource): s is ThumbnailPhotoSizeSource =>
	s.type === "thumbnail";
export const isDialogPhotoSmallSource = (
	s: PhotoSizeSource,
): s is DialogPhotoSmallPhotoSizeSource => s.type === "dialog_photo_small";
export const isDialogPhotoBigSource = (s: PhotoSizeSource): s is DialogPhotoBigPhotoSizeSource =>
	s.type === "dialog_photo_big";
export const isStickerSetThumbnailSource = (
	s: PhotoSizeSource,
): s is StickerSetThumbnailPhotoSizeSource => s.type === "sticker_set_thumbnail";

// -- parse ----------------------------------------------------------------------------------

// telegram serializes thumbnail_type as a single ASCII char in an int32 slot (LSB first);
// decode the printable prefix, trim the trailing zero bytes
function readThumbnailType(reader: BinaryReader): string {
	const chars = reader.readBytes(4);
	const firstZero = chars.indexOf(0);

	return new TextDecoder().decode(chars.subarray(0, firstZero === -1 ? 4 : firstZero));
}

function writeThumbnailType(writer: BinaryWriter, thumbnailType: string): void {
	const chars = new TextEncoder().encode(thumbnailType);
	const padded = new Uint8Array(4);
	padded.set(chars.subarray(0, Math.min(chars.byteLength, 4)));

	writer.writeBytes(padded);
}

// parse a tagged variant body. `outerVolumeId`/`consumeOuterLocalId` exist only in the
// 22..31 era (the caller passes undefined for the modern layout).
function parseVariant(
	reader: BinaryReader,
	sourceType: number,
	outerVolumeId: bigint | undefined,
	consumeOuterLocalId: () => number | undefined,
): PhotoSizeSource {
	switch (sourceType) {
		case PhotoSizeSourceType.Legacy: {
			const secret = reader.readInt64();
			const localId = consumeOuterLocalId() ?? 0;

			return {
				type: "legacy",
				...(outerVolumeId !== undefined ? { volumeId: outerVolumeId } : {}),
				secret,
				localId,
			};
		}

		case PhotoSizeSourceType.Thumbnail: {
			const fileType = reader.readUint32() as FileType;
			const thumbnailType = readThumbnailType(reader);
			const localId = consumeOuterLocalId();

			return {
				type: "thumbnail",
				...(outerVolumeId !== undefined ? { volumeId: outerVolumeId } : {}),
				fileType,
				thumbnailType,
				...(localId !== undefined ? { localId } : {}),
			};
		}

		case PhotoSizeSourceType.DialogPhotoSmall:
		case PhotoSizeSourceType.DialogPhotoBig: {
			const dialogId = reader.readInt64();
			const dialogAccessHash = reader.readInt64();
			const localId = consumeOuterLocalId();

			return {
				type:
					sourceType === PhotoSizeSourceType.DialogPhotoSmall
						? "dialog_photo_small"
						: "dialog_photo_big",
				...(outerVolumeId !== undefined ? { volumeId: outerVolumeId } : {}),
				dialogId,
				dialogAccessHash,
				...(localId !== undefined ? { localId } : {}),
			};
		}

		case PhotoSizeSourceType.StickerSetThumbnail: {
			const stickerSetId = reader.readInt64();
			const stickerSetAccessHash = reader.readInt64();
			const localId = consumeOuterLocalId();

			return {
				type: "sticker_set_thumbnail",
				...(outerVolumeId !== undefined ? { volumeId: outerVolumeId } : {}),
				stickerSetId,
				stickerSetAccessHash,
				...(localId !== undefined ? { localId } : {}),
			};
		}

		case PhotoSizeSourceType.FullLegacy: {
			const volumeId = reader.readInt64();
			const secret = reader.readInt64();
			const localId = reader.readInt32();

			return { type: "full_legacy", volumeId, secret, localId };
		}

		case PhotoSizeSourceType.DialogPhotoSmallLegacy:
		case PhotoSizeSourceType.DialogPhotoBigLegacy: {
			const dialogId = reader.readInt64();
			const dialogAccessHash = reader.readInt64();
			const volumeId = reader.readInt64();
			const localId = reader.readInt32();

			return {
				type:
					sourceType === PhotoSizeSourceType.DialogPhotoSmallLegacy
						? "dialog_photo_small_legacy"
						: "dialog_photo_big_legacy",
				dialogId,
				dialogAccessHash,
				volumeId,
				localId,
			};
		}

		case PhotoSizeSourceType.StickerSetThumbnailLegacy: {
			const stickerSetId = reader.readInt64();
			const stickerSetAccessHash = reader.readInt64();
			const volumeId = reader.readInt64();
			const localId = reader.readInt32();

			return {
				type: "sticker_set_thumbnail_legacy",
				stickerSetId,
				stickerSetAccessHash,
				volumeId,
				localId,
			};
		}

		case PhotoSizeSourceType.StickerSetThumbnailVersion: {
			const stickerSetId = reader.readInt64();
			const stickerSetAccessHash = reader.readInt64();
			const version = reader.readInt32();

			return {
				type: "sticker_set_thumbnail_version",
				stickerSetId,
				stickerSetAccessHash,
				version,
			};
		}

		default:
			throw new FileIdParseError(`unknown photo size source type ${sourceType}`);
	}
}

export function parsePhotoSizeSource(
	reader: BinaryReader,
	version: number,
	subVersion: number,
): PhotoSizeSource {
	// pre-AddPhotoSizeSource: implicit { volume_id, secret, local_id }
	if (version < 4 || subVersion < VERSION_ADD_PHOTO_SIZE_SOURCE) {
		const volumeId = reader.readInt64();
		const secret = reader.readInt64();
		const localId = reader.readInt32();

		return { type: "legacy", volumeId, secret, localId };
	}

	// RemovePhotoVolumeAndLocalId era — the variant carries everything
	if (subVersion >= VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID) {
		return parseVariant(reader, reader.readUint32(), undefined, () => undefined);
	}

	// AddPhotoSizeSource era: outer volume_id, tagged variant, then outer local_id
	const outerVolumeId = reader.readInt64();
	const sourceType = reader.readUint32();
	let outerLocalId: number | undefined;

	return parseVariant(reader, sourceType, outerVolumeId, () => {
		outerLocalId ??= reader.readInt32();
		return outerLocalId;
	});
}

// -- serialize ------------------------------------------------------------------------------

function sourceTypeOf(source: PhotoSizeSource): PhotoSizeSourceType {
	switch (source.type) {
		case "legacy":
			return PhotoSizeSourceType.Legacy;
		case "thumbnail":
			return PhotoSizeSourceType.Thumbnail;
		case "dialog_photo_small":
			return PhotoSizeSourceType.DialogPhotoSmall;
		case "dialog_photo_big":
			return PhotoSizeSourceType.DialogPhotoBig;
		case "sticker_set_thumbnail":
			return PhotoSizeSourceType.StickerSetThumbnail;
		case "full_legacy":
			return PhotoSizeSourceType.FullLegacy;
		case "dialog_photo_small_legacy":
			return PhotoSizeSourceType.DialogPhotoSmallLegacy;
		case "dialog_photo_big_legacy":
			return PhotoSizeSourceType.DialogPhotoBigLegacy;
		case "sticker_set_thumbnail_legacy":
			return PhotoSizeSourceType.StickerSetThumbnailLegacy;
		case "sticker_set_thumbnail_version":
			return PhotoSizeSourceType.StickerSetThumbnailVersion;
	}
}

export function serializePhotoSizeSource(
	writer: BinaryWriter,
	source: PhotoSizeSource,
	version: number,
	subVersion: number,
): void {
	// pre-AddPhotoSizeSource: implicit { volume_id, secret, local_id }
	if (version < 4 || subVersion < VERSION_ADD_PHOTO_SIZE_SOURCE) {
		if (source.type !== "legacy" && source.type !== "full_legacy") {
			throw new FileIdParseError(
				`the pre-${VERSION_ADD_PHOTO_SIZE_SOURCE} layout only fits legacy/full_legacy sources, got "${source.type}"`,
			);
		}

		writer.writeInt64(source.volumeId ?? 0n);
		writer.writeInt64(source.secret);
		writer.writeInt32(source.localId);

		return;
	}

	const isModern = subVersion >= VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID;

	// the 22..31 layout writes an outer volume_id before the variant tag
	if (!isModern) {
		if (!("volumeId" in source) || source.volumeId === undefined) {
			throw new FileIdParseError(
				`source.volumeId is required for sub_version < ${VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID}`,
			);
		}

		writer.writeInt64(source.volumeId);
	}

	writer.writeUint32(sourceTypeOf(source));

	switch (source.type) {
		case "legacy":
			writer.writeInt64(source.secret);
			writer.writeInt32(source.localId); // outer local_id of the 22..31 layout

			return;

		case "thumbnail":
			writer.writeUint32(source.fileType);
			writeThumbnailType(writer, source.thumbnailType);
			if (!isModern) writer.writeInt32(source.localId ?? 0);

			return;

		case "dialog_photo_small":
		case "dialog_photo_big":
			writer.writeInt64(source.dialogId);
			writer.writeInt64(source.dialogAccessHash);
			if (!isModern) writer.writeInt32(source.localId ?? 0);

			return;

		case "sticker_set_thumbnail":
			writer.writeInt64(source.stickerSetId);
			writer.writeInt64(source.stickerSetAccessHash);
			if (!isModern) writer.writeInt32(source.localId ?? 0);

			return;

		case "full_legacy":
			writer.writeInt64(source.volumeId);
			writer.writeInt64(source.secret);
			writer.writeInt32(source.localId);

			return;

		case "dialog_photo_small_legacy":
		case "dialog_photo_big_legacy":
			writer.writeInt64(source.dialogId);
			writer.writeInt64(source.dialogAccessHash);
			writer.writeInt64(source.volumeId);
			writer.writeInt32(source.localId);

			return;

		case "sticker_set_thumbnail_legacy":
			writer.writeInt64(source.stickerSetId);
			writer.writeInt64(source.stickerSetAccessHash);
			writer.writeInt64(source.volumeId);
			writer.writeInt32(source.localId);

			return;

		case "sticker_set_thumbnail_version":
			writer.writeInt64(source.stickerSetId);
			writer.writeInt64(source.stickerSetAccessHash);
			writer.writeInt32(source.version);
	}
}
