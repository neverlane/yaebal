/**
 * @yaebal/file-id — parse, inspect and re-serialize telegram `file_id` /
 * `file_unique_id` strings. a `file_id` is a TL-serialized TDLib blob (dc id,
 * access hash, photo size source, …) behind RLE + url-safe base64 — this package
 * decodes it. zero deps, no telegram client required.
 */

export {
	FILE_REFERENCE_FLAG,
	FILE_TYPE_TO_UNIQUE,
	FileType,
	FileUniqueType,
	MAX_SUPPORTED_VERSION,
	PhotoSizeSourceType,
	VERSION_ADD_PHOTO_SIZE_SOURCE,
	VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID,
	WEB_LOCATION_FLAG,
} from "./constants.js";
export {
	BinaryReader,
	BinaryWriter,
	base64urlDecode,
	base64urlEncode,
	packTlString,
	rleDecode,
	rleEncode,
	unpackTlString,
} from "./encoding.js";
export { FileIdParseError, UnsupportedFileIdVersionError } from "./errors.js";
export {
	type DocumentFileId,
	FileId,
	isDocumentFileId,
	isPhotoFileId,
	isStickerFileId,
	isWebFileId,
	type ParsedFileId,
	type PhotoFileId,
	parseFileId,
	serializeFileId,
	type WebFileId,
} from "./file-id.js";
export {
	type DocumentFileUniqueId,
	type EncryptedFileUniqueId,
	FileUniqueId,
	fileUniqueIdFromFileId,
	isDocumentUniqueId,
	isEncryptedUniqueId,
	isPhotoUniqueId,
	isSecureUniqueId,
	isTempUniqueId,
	isWebUniqueId,
	type ParsedFileUniqueId,
	type PhotoFileUniqueId,
	parseFileUniqueId,
	type SecureFileUniqueId,
	serializeFileUniqueId,
	type TempFileUniqueId,
	type WebFileUniqueId,
} from "./file-unique-id.js";
export {
	type DialogPhotoBigLegacyPhotoSizeSource,
	type DialogPhotoBigPhotoSizeSource,
	type DialogPhotoSmallLegacyPhotoSizeSource,
	type DialogPhotoSmallPhotoSizeSource,
	type FullLegacyPhotoSizeSource,
	isDialogPhotoBigSource,
	isDialogPhotoSmallSource,
	isLegacySource,
	isStickerSetThumbnailSource,
	isThumbnailSource,
	type LegacyPhotoSizeSource,
	type PhotoSizeSource,
	parsePhotoSizeSource,
	type StickerSetThumbnailLegacyPhotoSizeSource,
	type StickerSetThumbnailPhotoSizeSource,
	type StickerSetThumbnailVersionPhotoSizeSource,
	serializePhotoSizeSource,
	type ThumbnailPhotoSizeSource,
} from "./photo-size-source.js";
