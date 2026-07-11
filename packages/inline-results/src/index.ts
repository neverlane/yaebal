import type {
	FormattedText,
	InlineQueryResultArticle,
	InlineQueryResultAudio,
	InlineQueryResultCachedAudio,
	InlineQueryResultCachedDocument,
	InlineQueryResultCachedGif,
	InlineQueryResultCachedMpeg4Gif,
	InlineQueryResultCachedPhoto,
	InlineQueryResultCachedSticker,
	InlineQueryResultCachedVideo,
	InlineQueryResultCachedVoice,
	InlineQueryResultContact,
	InlineQueryResultDocument,
	InlineQueryResultGame,
	InlineQueryResultGif,
	InlineQueryResultLocation,
	InlineQueryResultMpeg4Gif,
	InlineQueryResultPhoto,
	InlineQueryResultVenue,
	InlineQueryResultVideo,
	InlineQueryResultVoice,
	InputContactMessageContent,
	InputInvoiceMessageContent,
	InputLocationMessageContent,
	InputTextMessageContent,
	InputVenueMessageContent,
	LabeledPrice,
} from "@yaebal/types";

export type {
	InlineQueryResult as InlineQueryResultValue,
	InputMessageContent as InputMessageContentValue,
} from "@yaebal/types";

/**
 * @yaebal/inline-results — one factory per `InlineQueryResult` (and
 * `InputMessageContent`) variant, so `answerInlineQuery` payloads read as data
 * instead of hand-rolled object literals. required fields are positional,
 * everything else (`reply_markup`, thumbnails, captions, …) is a trailing
 * options object typed off the real schema — nothing here can drift from
 * `@yaebal/types`. `caption` / `message_text` accept a `FormattedText`
 * (`{ text, entities }`, the shape `format`/`html`/`md` from `@yaebal/core` and
 * `@yaebal/fmt` produce) — `bot.api` decomposes it into the wire fields
 * automatically, the same way it does for every other formatted-text param.
 */

type Extra<T, Required extends string> = Partial<Omit<T, "type" | "id" | Required>>;

export const InlineQueryResult = {
	/** a link to an article or web page — the only variant that requires `input_message_content`. */
	article(
		id: string,
		title: string,
		inputMessageContent: InlineQueryResultArticle["input_message_content"],
		extra: Extra<InlineQueryResultArticle, "title" | "input_message_content"> = {},
	): InlineQueryResultArticle {
		return { type: "article", id, title, input_message_content: inputMessageContent, ...extra };
	},

	/** a link to an MP3 audio file. */
	audio(
		id: string,
		audioUrl: string,
		title: string,
		extra: Extra<InlineQueryResultAudio, "audio_url" | "title"> = {},
	): InlineQueryResultAudio {
		return { type: "audio", id, audio_url: audioUrl, title, ...extra };
	},

	/** a contact with a phone number. */
	contact(
		id: string,
		phoneNumber: string,
		firstName: string,
		extra: Extra<InlineQueryResultContact, "phone_number" | "first_name"> = {},
	): InlineQueryResultContact {
		return { type: "contact", id, phone_number: phoneNumber, first_name: firstName, ...extra };
	},

	/** a link to a `.pdf`/`.zip` file. */
	document(
		id: string,
		title: string,
		documentUrl: string,
		mimeType: "application/pdf" | "application/zip",
		extra: Extra<InlineQueryResultDocument, "title" | "document_url" | "mime_type"> = {},
	): InlineQueryResultDocument {
		return {
			type: "document",
			id,
			title,
			document_url: documentUrl,
			mime_type: mimeType,
			...extra,
		};
	},

	/** a [Game](https://core.telegram.org/bots/api/#games) by its short name. */
	game(
		id: string,
		gameShortName: string,
		extra: Extra<InlineQueryResultGame, "game_short_name"> = {},
	): InlineQueryResultGame {
		return { type: "game", id, game_short_name: gameShortName, ...extra };
	},

	/** a link to an animated GIF file. */
	gif(
		id: string,
		gifUrl: string,
		thumbnailUrl: string,
		extra: Extra<InlineQueryResultGif, "gif_url" | "thumbnail_url"> = {},
	): InlineQueryResultGif {
		return { type: "gif", id, gif_url: gifUrl, thumbnail_url: thumbnailUrl, ...extra };
	},

	/** a location on a map. */
	location(
		id: string,
		latitude: number,
		longitude: number,
		title: string,
		extra: Extra<InlineQueryResultLocation, "latitude" | "longitude" | "title"> = {},
	): InlineQueryResultLocation {
		return { type: "location", id, latitude, longitude, title, ...extra };
	},

	/** a link to a video animation (H.264/MPEG-4 AVC without sound). */
	mpeg4Gif(
		id: string,
		mpeg4Url: string,
		thumbnailUrl: string,
		extra: Extra<InlineQueryResultMpeg4Gif, "mpeg4_url" | "thumbnail_url"> = {},
	): InlineQueryResultMpeg4Gif {
		return { type: "mpeg4_gif", id, mpeg4_url: mpeg4Url, thumbnail_url: thumbnailUrl, ...extra };
	},

	/** a link to a JPEG photo (≤5MB). */
	photo(
		id: string,
		photoUrl: string,
		thumbnailUrl: string,
		extra: Extra<InlineQueryResultPhoto, "photo_url" | "thumbnail_url"> = {},
	): InlineQueryResultPhoto {
		return { type: "photo", id, photo_url: photoUrl, thumbnail_url: thumbnailUrl, ...extra };
	},

	/** a venue. */
	venue(
		id: string,
		latitude: number,
		longitude: number,
		title: string,
		address: string,
		extra: Extra<InlineQueryResultVenue, "latitude" | "longitude" | "title" | "address"> = {},
	): InlineQueryResultVenue {
		return { type: "venue", id, latitude, longitude, title, address, ...extra };
	},

	/** a link to a page with an embedded video player, or a video file. */
	video(
		id: string,
		videoUrl: string,
		mimeType: "text/html" | "video/mp4",
		thumbnailUrl: string,
		title: string,
		extra: Extra<
			InlineQueryResultVideo,
			"video_url" | "mime_type" | "thumbnail_url" | "title"
		> = {},
	): InlineQueryResultVideo {
		return {
			type: "video",
			id,
			video_url: videoUrl,
			mime_type: mimeType,
			thumbnail_url: thumbnailUrl,
			title,
			...extra,
		};
	},

	/** a link to an OGG/OPUS voice recording. */
	voice(
		id: string,
		voiceUrl: string,
		title: string,
		extra: Extra<InlineQueryResultVoice, "voice_url" | "title"> = {},
	): InlineQueryResultVoice {
		return { type: "voice", id, voice_url: voiceUrl, title, ...extra };
	},

	/** variants backed by a `file_id` already on telegram's servers, not a URL. */
	cached: {
		/** a cached MP3 audio file. */
		audio(
			id: string,
			audioFileId: string,
			extra: Extra<InlineQueryResultCachedAudio, "audio_file_id"> = {},
		): InlineQueryResultCachedAudio {
			return { type: "audio", id, audio_file_id: audioFileId, ...extra };
		},

		/** a cached `.pdf`/`.zip` file. */
		document(
			id: string,
			title: string,
			documentFileId: string,
			extra: Extra<InlineQueryResultCachedDocument, "title" | "document_file_id"> = {},
		): InlineQueryResultCachedDocument {
			return { type: "document", id, title, document_file_id: documentFileId, ...extra };
		},

		/** a cached animated GIF file. */
		gif(
			id: string,
			gifFileId: string,
			extra: Extra<InlineQueryResultCachedGif, "gif_file_id"> = {},
		): InlineQueryResultCachedGif {
			return { type: "gif", id, gif_file_id: gifFileId, ...extra };
		},

		/** a cached H.264/MPEG-4 AVC video animation (no sound). */
		mpeg4Gif(
			id: string,
			mpeg4FileId: string,
			extra: Extra<InlineQueryResultCachedMpeg4Gif, "mpeg4_file_id"> = {},
		): InlineQueryResultCachedMpeg4Gif {
			return { type: "mpeg4_gif", id, mpeg4_file_id: mpeg4FileId, ...extra };
		},

		/** a cached photo. */
		photo(
			id: string,
			photoFileId: string,
			extra: Extra<InlineQueryResultCachedPhoto, "photo_file_id"> = {},
		): InlineQueryResultCachedPhoto {
			return { type: "photo", id, photo_file_id: photoFileId, ...extra };
		},

		/** a cached sticker. */
		sticker(
			id: string,
			stickerFileId: string,
			extra: Extra<InlineQueryResultCachedSticker, "sticker_file_id"> = {},
		): InlineQueryResultCachedSticker {
			return { type: "sticker", id, sticker_file_id: stickerFileId, ...extra };
		},

		/** a cached video file. */
		video(
			id: string,
			title: string,
			videoFileId: string,
			extra: Extra<InlineQueryResultCachedVideo, "title" | "video_file_id"> = {},
		): InlineQueryResultCachedVideo {
			return { type: "video", id, title, video_file_id: videoFileId, ...extra };
		},

		/** a cached OGG/OPUS voice message. */
		voice(
			id: string,
			title: string,
			voiceFileId: string,
			extra: Extra<InlineQueryResultCachedVoice, "title" | "voice_file_id"> = {},
		): InlineQueryResultCachedVoice {
			return { type: "voice", id, title, voice_file_id: voiceFileId, ...extra };
		},
	},
};

/**
 * builders for `input_message_content` — what actually gets sent instead of the
 * result's own preview (required for `article`, optional elsewhere). not covered:
 * `InputRichMessageContent` — build that block tree with `@yaebal/rich` directly,
 * its output already satisfies the interface.
 */
export const InputMessageContent = {
	/** plain or formatted text (`FormattedText` — see the module doc). */
	text(
		messageText: string | FormattedText,
		extra: Extra<InputTextMessageContent, "message_text"> = {},
	): InputTextMessageContent {
		return { message_text: messageText, ...extra };
	},

	/** a location. */
	location(
		latitude: number,
		longitude: number,
		extra: Extra<InputLocationMessageContent, "latitude" | "longitude"> = {},
	): InputLocationMessageContent {
		return { latitude, longitude, ...extra };
	},

	/** a venue. */
	venue(
		latitude: number,
		longitude: number,
		title: string,
		address: string,
		extra: Extra<InputVenueMessageContent, "latitude" | "longitude" | "title" | "address"> = {},
	): InputVenueMessageContent {
		return { latitude, longitude, title, address, ...extra };
	},

	/** a contact. */
	contact(
		phoneNumber: string,
		firstName: string,
		extra: Extra<InputContactMessageContent, "phone_number" | "first_name"> = {},
	): InputContactMessageContent {
		return { phone_number: phoneNumber, first_name: firstName, ...extra };
	},

	/** an invoice — `prices` must hold exactly one item for Telegram Stars (`currency: "XTR"`). */
	invoice(
		title: string,
		description: string,
		payload: string,
		currency: string,
		prices: LabeledPrice[],
		extra: Extra<
			InputInvoiceMessageContent,
			"title" | "description" | "payload" | "currency" | "prices"
		> = {},
	): InputInvoiceMessageContent {
		return { title, description, payload, currency, prices, ...extra };
	},
};
