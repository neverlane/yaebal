// file_id type ids — mirror TDLib's FileType enum
// https://core.telegram.org/tdlib/getting-started#downloading-files
export const FileType = {
	Thumbnail: 0,
	ProfilePhoto: 1,
	Photo: 2,
	VoiceNote: 3,
	Video: 4,
	Document: 5,
	Encrypted: 6,
	Temp: 7,
	Sticker: 8,
	Audio: 9,
	Animation: 10,
	EncryptedThumbnail: 11,
	Wallpaper: 12,
	VideoNote: 13,
	SecureDecrypted: 14,
	SecureEncrypted: 15,
	Background: 16,
	DocumentAsFile: 17,
	Ringtone: 18,
	CallLog: 19,
	PhotoStory: 20,
	VideoStory: 21,
	SelfDestructingPhoto: 22,
	SelfDestructingVideo: 23,
	SelfDestructingVideoNote: 24,
	SelfDestructingVoiceNote: 25,
	None: 26,
} as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

// flags packed into the high bits of the leading type-id int32
export const WEB_LOCATION_FLAG = 0x01000000;
export const FILE_REFERENCE_FLAG = 0x02000000;

// file_unique_id type ids — a small, separate tag space
export const FileUniqueType = {
	Web: 0,
	Photo: 1,
	Document: 2,
	Secure: 3,
	Encrypted: 4,
	Temp: 5,
} as const;

export type FileUniqueType = (typeof FileUniqueType)[keyof typeof FileUniqueType];

// PhotoSizeSource variant tags — mirror TDLib's PhotoSizeSource::Type
export const PhotoSizeSourceType = {
	Legacy: 0,
	Thumbnail: 1,
	DialogPhotoSmall: 2,
	DialogPhotoBig: 3,
	StickerSetThumbnail: 4,
	FullLegacy: 5,
	DialogPhotoSmallLegacy: 6,
	DialogPhotoBigLegacy: 7,
	StickerSetThumbnailLegacy: 8,
	StickerSetThumbnailVersion: 9,
} as const;

export type PhotoSizeSourceType = (typeof PhotoSizeSourceType)[keyof typeof PhotoSizeSourceType];

// TDLib version cutoffs that change the photo file_id binary layout
// (td/telegram/Version.h, enum class Version)
export const VERSION_ADD_PHOTO_SIZE_SOURCE = 22;
export const VERSION_REMOVE_PHOTO_VOLUME_AND_LOCAL_ID = 32;

/** the newest file_id major version this parser round-trips. */
export const MAX_SUPPORTED_VERSION = 4;

/** full {@link FileType} → {@link FileUniqueType} mapping, used by `fileUniqueIdFromFileId`. */
export const FILE_TYPE_TO_UNIQUE: ReadonlyMap<FileType, FileUniqueType> = new Map<
	FileType,
	FileUniqueType
>([
	[FileType.Thumbnail, FileUniqueType.Photo],
	[FileType.ProfilePhoto, FileUniqueType.Photo],
	[FileType.Photo, FileUniqueType.Photo],
	[FileType.EncryptedThumbnail, FileUniqueType.Photo],
	[FileType.Wallpaper, FileUniqueType.Photo],
	[FileType.PhotoStory, FileUniqueType.Photo],
	[FileType.SelfDestructingPhoto, FileUniqueType.Photo],

	[FileType.VoiceNote, FileUniqueType.Document],
	[FileType.Video, FileUniqueType.Document],
	[FileType.Document, FileUniqueType.Document],
	[FileType.Sticker, FileUniqueType.Document],
	[FileType.Audio, FileUniqueType.Document],
	[FileType.Animation, FileUniqueType.Document],
	[FileType.VideoNote, FileUniqueType.Document],
	[FileType.Background, FileUniqueType.Document],
	[FileType.DocumentAsFile, FileUniqueType.Document],
	[FileType.Ringtone, FileUniqueType.Document],
	[FileType.VideoStory, FileUniqueType.Document],
	[FileType.SelfDestructingVideo, FileUniqueType.Document],
	[FileType.SelfDestructingVideoNote, FileUniqueType.Document],
	[FileType.SelfDestructingVoiceNote, FileUniqueType.Document],

	[FileType.SecureDecrypted, FileUniqueType.Secure],
	[FileType.SecureEncrypted, FileUniqueType.Secure],

	[FileType.Encrypted, FileUniqueType.Encrypted],

	[FileType.Temp, FileUniqueType.Temp],
]);
