import type {
	RichBlock,
	RichBlockAnchor,
	RichBlockAnimation,
	RichBlockAudio,
	RichBlockBlockQuotation,
	RichBlockButtons,
	RichBlockCollage,
	RichBlockDetails,
	RichBlockDivider,
	RichBlockDocument,
	RichBlockExpandableBlockQuotation,
	RichBlockFooter,
	RichBlockList,
	RichBlockMap,
	RichBlockMathematicalExpression,
	RichBlockParagraph,
	RichBlockPhoto,
	RichBlockPreformatted,
	RichBlockPullQuotation,
	RichBlockSectionHeading,
	RichBlockSlideshow,
	RichBlockTable,
	RichBlockThinking,
	RichBlockVideo,
	RichBlockVoiceNote,
	RichText,
	RichTextAnchor,
	RichTextAnchorLink,
	RichTextBankCardNumber,
	RichTextBold,
	RichTextBotCommand,
	RichTextButton,
	RichTextCashtag,
	RichTextCode,
	RichTextCustomEmoji,
	RichTextDateTime,
	RichTextEmailAddress,
	RichTextHashtag,
	RichTextItalic,
	RichTextMarked,
	RichTextMathematicalExpression,
	RichTextMention,
	RichTextPhoneNumber,
	RichTextReference,
	RichTextReferenceLink,
	RichTextSpoiler,
	RichTextStrikethrough,
	RichTextSubscript,
	RichTextSuperscript,
	RichTextTextMention,
	RichTextUnderline,
	RichTextUrl,
} from "@yaebal/types";

/**
 * the generated `.type` field is typed as plain `string` (the codegen doesn't turn
 * telegram's "always X" doc convention into a literal type), so `RichBlock["type"]`
 * can't discriminate the union on its own — `Extract<RichBlock, { type: "table" }>`
 * would just be `never`. this lookup map is the narrowing telescope instead: one
 * entry per `.type` string, hand-matched to its interface.
 */
interface RichBlockByType {
	paragraph: RichBlockParagraph;
	heading: RichBlockSectionHeading;
	pre: RichBlockPreformatted;
	footer: RichBlockFooter;
	divider: RichBlockDivider;
	mathematical_expression: RichBlockMathematicalExpression;
	anchor: RichBlockAnchor;
	list: RichBlockList;
	blockquote: RichBlockBlockQuotation;
	expandable_blockquote: RichBlockExpandableBlockQuotation;
	pullquote: RichBlockPullQuotation;
	collage: RichBlockCollage;
	slideshow: RichBlockSlideshow;
	table: RichBlockTable;
	details: RichBlockDetails;
	map: RichBlockMap;
	buttons: RichBlockButtons;
	animation: RichBlockAnimation;
	audio: RichBlockAudio;
	document: RichBlockDocument;
	photo: RichBlockPhoto;
	video: RichBlockVideo;
	voice_note: RichBlockVoiceNote;
	thinking: RichBlockThinking;
}

interface RichTextByType {
	bold: RichTextBold;
	italic: RichTextItalic;
	underline: RichTextUnderline;
	strikethrough: RichTextStrikethrough;
	spoiler: RichTextSpoiler;
	date_time: RichTextDateTime;
	text_mention: RichTextTextMention;
	subscript: RichTextSubscript;
	superscript: RichTextSuperscript;
	marked: RichTextMarked;
	code: RichTextCode;
	custom_emoji: RichTextCustomEmoji;
	mathematical_expression: RichTextMathematicalExpression;
	url: RichTextUrl;
	email_address: RichTextEmailAddress;
	phone_number: RichTextPhoneNumber;
	bank_card_number: RichTextBankCardNumber;
	mention: RichTextMention;
	hashtag: RichTextHashtag;
	cashtag: RichTextCashtag;
	bot_command: RichTextBotCommand;
	button: RichTextButton;
	anchor: RichTextAnchor;
	anchor_link: RichTextAnchorLink;
	reference: RichTextReference;
	reference_link: RichTextReferenceLink;
}

function blockGuard<K extends keyof RichBlockByType>(type: K) {
	return (block: RichBlock): block is RichBlockByType[K] => block.type === type;
}

function textGuard<K extends keyof RichTextByType>(type: K) {
	return (text: RichText): text is RichTextByType[K] => text.type === type;
}

// --- RichBlock (24 variants) — one guard per `.type` discriminant ---

export const isParagraph = blockGuard("paragraph");
export const isHeading = blockGuard("heading");
export const isPreformatted = blockGuard("pre");
export const isFooter = blockGuard("footer");
export const isDivider = blockGuard("divider");
export const isMathBlock = blockGuard("mathematical_expression");
export const isAnchorBlock = blockGuard("anchor");
export const isList = blockGuard("list");
export const isBlockquote = blockGuard("blockquote");
export const isExpandableBlockquote = blockGuard("expandable_blockquote");
export const isPullquote = blockGuard("pullquote");
export const isCollage = blockGuard("collage");
export const isSlideshow = blockGuard("slideshow");
export const isTable = blockGuard("table");
export const isDetails = blockGuard("details");
export const isMap = blockGuard("map");
export const isButtons = blockGuard("buttons");
export const isAnimation = blockGuard("animation");
export const isAudio = blockGuard("audio");
export const isDocument = blockGuard("document");
export const isPhoto = blockGuard("photo");
export const isVideo = blockGuard("video");
export const isVoiceNote = blockGuard("voice_note");
export const isThinking = blockGuard("thinking");

// --- RichText (26 variants) ---

export const isBold = textGuard("bold");
export const isItalic = textGuard("italic");
export const isUnderline = textGuard("underline");
export const isStrikethrough = textGuard("strikethrough");
export const isSpoilerText = textGuard("spoiler");
export const isDateTime = textGuard("date_time");
export const isTextMention = textGuard("text_mention");
export const isSubscript = textGuard("subscript");
export const isSuperscript = textGuard("superscript");
export const isMarked = textGuard("marked");
export const isCodeText = textGuard("code");
export const isCustomEmoji = textGuard("custom_emoji");
export const isMathText = textGuard("mathematical_expression");
export const isUrlText = textGuard("url");
export const isEmailAddress = textGuard("email_address");
export const isPhoneNumber = textGuard("phone_number");
export const isBankCardNumber = textGuard("bank_card_number");
export const isMentionText = textGuard("mention");
export const isHashtag = textGuard("hashtag");
export const isCashtag = textGuard("cashtag");
export const isBotCommand = textGuard("bot_command");
export const isButton = textGuard("button");
export const isAnchorText = textGuard("anchor");
export const isAnchorLink = textGuard("anchor_link");
export const isReference = textGuard("reference");
export const isReferenceLink = textGuard("reference_link");
