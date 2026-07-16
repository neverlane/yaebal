// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// regenerate with: pnpm --filter @yaebal/types generate

/**
 * one spot in a method's params that carries user-visible text. either a pair —
 * `field` holds the text and `entities` names the sibling `MessageEntity[]`
 * param — or a container: walk into `field` (an object or an array of objects)
 * and apply the `nested` sites there.
 */
export interface FormatFieldSpec {
	field: string;
	entities?: string;
	nested?: readonly FormatFieldSpec[];
}

/**
 * for every Bot API method that accepts formatted text: where that text lives in
 * the params, including nested spots (`reply_parameters.quote`, poll options,
 * media groups, inline results, checklists, …). derived from the schema by
 * pairing each `X_entities` field with its sibling `X`.
 */
export const formatFields: Readonly<Record<string, readonly FormatFieldSpec[]>> = {
	answerGuestQuery: [
		{ field: "result", nested: [
			{ field: "caption", entities: "caption_entities" },
			{ field: "input_message_content", nested: [
				{ field: "message_text", entities: "entities" },
				{ field: "rich_message", nested: [
					{ field: "blocks", nested: [
						{ field: "animation", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "audio", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "photo", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "video", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "voice_note", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
					{ field: "media", nested: [
						{ field: "media", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
				] },
			] },
		] },
	],
	answerInlineQuery: [
		{ field: "results", nested: [
			{ field: "caption", entities: "caption_entities" },
			{ field: "input_message_content", nested: [
				{ field: "message_text", entities: "entities" },
				{ field: "rich_message", nested: [
					{ field: "blocks", nested: [
						{ field: "animation", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "audio", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "photo", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "video", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "voice_note", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
					{ field: "media", nested: [
						{ field: "media", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
				] },
			] },
		] },
	],
	answerWebAppQuery: [
		{ field: "result", nested: [
			{ field: "caption", entities: "caption_entities" },
			{ field: "input_message_content", nested: [
				{ field: "message_text", entities: "entities" },
				{ field: "rich_message", nested: [
					{ field: "blocks", nested: [
						{ field: "animation", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "audio", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "photo", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "video", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "voice_note", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
					{ field: "media", nested: [
						{ field: "media", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
				] },
			] },
		] },
	],
	copyMessage: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	editEphemeralMessageCaption: [
		{ field: "caption", entities: "caption_entities" },
	],
	editEphemeralMessageMedia: [
		{ field: "media", nested: [
			{ field: "caption", entities: "caption_entities" },
		] },
	],
	editEphemeralMessageText: [
		{ field: "text", entities: "entities" },
	],
	editMessageCaption: [
		{ field: "caption", entities: "caption_entities" },
	],
	editMessageChecklist: [
		{ field: "checklist", nested: [
			{ field: "title", entities: "title_entities" },
			{ field: "tasks", nested: [
				{ field: "text", entities: "text_entities" },
			] },
		] },
	],
	editMessageMedia: [
		{ field: "media", nested: [
			{ field: "caption", entities: "caption_entities" },
		] },
	],
	editMessageText: [
		{ field: "text", entities: "entities" },
		{ field: "rich_message", nested: [
			{ field: "blocks", nested: [
				{ field: "animation", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "audio", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "photo", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "video", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "voice_note", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
			{ field: "media", nested: [
				{ field: "media", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
		] },
	],
	editStory: [
		{ field: "caption", entities: "caption_entities" },
	],
	giftPremiumSubscription: [
		{ field: "text", entities: "text_entities" },
	],
	postStory: [
		{ field: "caption", entities: "caption_entities" },
	],
	savePreparedInlineMessage: [
		{ field: "result", nested: [
			{ field: "caption", entities: "caption_entities" },
			{ field: "input_message_content", nested: [
				{ field: "message_text", entities: "entities" },
				{ field: "rich_message", nested: [
					{ field: "blocks", nested: [
						{ field: "animation", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "audio", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "photo", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "video", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
						{ field: "voice_note", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
					{ field: "media", nested: [
						{ field: "media", nested: [
							{ field: "caption", entities: "caption_entities" },
						] },
					] },
				] },
			] },
		] },
	],
	sendAnimation: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendAudio: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendChecklist: [
		{ field: "checklist", nested: [
			{ field: "title", entities: "title_entities" },
			{ field: "tasks", nested: [
				{ field: "text", entities: "text_entities" },
			] },
		] },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendContact: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendDice: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendDocument: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendGame: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendGift: [
		{ field: "text", entities: "text_entities" },
	],
	sendInvoice: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendLivePhoto: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendLocation: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendMediaGroup: [
		{ field: "media", nested: [
			{ field: "caption", entities: "caption_entities" },
		] },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendMessage: [
		{ field: "text", entities: "entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendMessageDraft: [
		{ field: "text", entities: "entities" },
	],
	sendPaidMedia: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendPhoto: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendPoll: [
		{ field: "question", entities: "question_entities" },
		{ field: "explanation", entities: "explanation_entities" },
		{ field: "description", entities: "description_entities" },
		{ field: "options", nested: [
			{ field: "text", entities: "text_entities" },
			{ field: "media", nested: [
				{ field: "caption", entities: "caption_entities" },
			] },
		] },
		{ field: "explanation_media", nested: [
			{ field: "caption", entities: "caption_entities" },
		] },
		{ field: "media", nested: [
			{ field: "caption", entities: "caption_entities" },
		] },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendRichMessage: [
		{ field: "rich_message", nested: [
			{ field: "blocks", nested: [
				{ field: "animation", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "audio", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "photo", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "video", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "voice_note", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
			{ field: "media", nested: [
				{ field: "media", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
		] },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendRichMessageDraft: [
		{ field: "rich_message", nested: [
			{ field: "blocks", nested: [
				{ field: "animation", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "audio", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "photo", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "video", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
				{ field: "voice_note", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
			{ field: "media", nested: [
				{ field: "media", nested: [
					{ field: "caption", entities: "caption_entities" },
				] },
			] },
		] },
	],
	sendSticker: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendVenue: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendVideo: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendVideoNote: [
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
	sendVoice: [
		{ field: "caption", entities: "caption_entities" },
		{ field: "reply_parameters", nested: [
			{ field: "quote", entities: "quote_entities" },
		] },
	],
};
