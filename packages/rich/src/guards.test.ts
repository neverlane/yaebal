import assert from "node:assert/strict";
import test from "node:test";
import type { RichBlock, RichText } from "@yaebal/types";
import {
	isAnchorBlock,
	isAnchorLink,
	isAnchorText,
	isAnimation,
	isAudio,
	isBankCardNumber,
	isBlockquote,
	isBold,
	isBotCommand,
	isCashtag,
	isCodeText,
	isCollage,
	isCustomEmoji,
	isDateTime,
	isDetails,
	isDivider,
	isEmailAddress,
	isFooter,
	isHashtag,
	isHeading,
	isItalic,
	isList,
	isMap,
	isMarked,
	isMathBlock,
	isMathText,
	isMentionText,
	isParagraph,
	isPhoneNumber,
	isPhoto,
	isPreformatted,
	isPullquote,
	isReference,
	isReferenceLink,
	isSlideshow,
	isSpoilerText,
	isStrikethrough,
	isSubscript,
	isSuperscript,
	isTable,
	isTextMention,
	isThinking,
	isUnderline,
	isUrlText,
	isVideo,
	isVoiceNote,
} from "./guards.js";

const BLOCK_GUARDS: [string, (b: RichBlock) => boolean][] = [
	["paragraph", isParagraph],
	["heading", isHeading],
	["pre", isPreformatted],
	["footer", isFooter],
	["divider", isDivider],
	["mathematical_expression", isMathBlock],
	["anchor", isAnchorBlock],
	["list", isList],
	["blockquote", isBlockquote],
	["pullquote", isPullquote],
	["collage", isCollage],
	["slideshow", isSlideshow],
	["table", isTable],
	["details", isDetails],
	["map", isMap],
	["animation", isAnimation],
	["audio", isAudio],
	["photo", isPhoto],
	["video", isVideo],
	["voice_note", isVoiceNote],
	["thinking", isThinking],
];

const TEXT_GUARDS: [string, (t: RichText) => boolean][] = [
	["bold", isBold],
	["italic", isItalic],
	["underline", isUnderline],
	["strikethrough", isStrikethrough],
	["spoiler", isSpoilerText],
	["date_time", isDateTime],
	["text_mention", isTextMention],
	["subscript", isSubscript],
	["superscript", isSuperscript],
	["marked", isMarked],
	["code", isCodeText],
	["custom_emoji", isCustomEmoji],
	["mathematical_expression", isMathText],
	["url", isUrlText],
	["email_address", isEmailAddress],
	["phone_number", isPhoneNumber],
	["bank_card_number", isBankCardNumber],
	["mention", isMentionText],
	["hashtag", isHashtag],
	["cashtag", isCashtag],
	["bot_command", isBotCommand],
	["anchor", isAnchorText],
	["anchor_link", isAnchorLink],
	["reference", isReference],
	["reference_link", isReferenceLink],
];

test("every RichBlock guard matches its own .type and rejects every other guard's", () => {
	for (const [type, guard] of BLOCK_GUARDS) {
		const block = { type } as unknown as RichBlock;
		assert.equal(guard(block), true, `${type} guard should match its own type`);

		for (const [otherType, otherGuard] of BLOCK_GUARDS) {
			if (otherType === type) continue;
			assert.equal(otherGuard(block), false, `${otherType} guard should reject a "${type}" block`);
		}
	}
});

test("every RichText guard matches its own .type and rejects every other guard's", () => {
	for (const [type, guard] of TEXT_GUARDS) {
		const text = { type } as unknown as RichText;
		assert.equal(guard(text), true, `${type} guard should match its own type`);

		for (const [otherType, otherGuard] of TEXT_GUARDS) {
			if (otherType === type) continue;
			assert.equal(otherGuard(text), false, `${otherType} guard should reject a "${type}" text`);
		}
	}
});

test("guards narrow RichBlock by .type despite the generated field being `string`", () => {
	const blocks = [
		{ type: "table", cells: [[{ text: "x", align: "left", valign: "top" }]] },
		{ type: "photo", photo: [] },
	] as unknown as RichBlock[];

	assert.equal(isTable(blocks[0] as RichBlock), true);
	assert.equal(isPhoto(blocks[1] as RichBlock), true);
	assert.equal(isTable(blocks[1] as RichBlock), false);
});
