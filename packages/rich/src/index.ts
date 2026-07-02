/**
 * @yaebal/rich — telegram's `sendRichMessage` / `sendRichMessageDraft`.
 *
 * unlike classic `parse_mode`/entities (see `@yaebal/fmt`), a rich message is a
 * block-tree document: you write extended html (or markdown) once, telegram
 * parses it server-side, and you get the same tree back on `message.rich_message`.
 * this package covers all three parts of that surface:
 *
 * - **write**: `document()` + block builders (blocks.ts) and inline mark builders
 *   (inline.ts) assemble an `InputRichMessage` without hand-written angle brackets.
 * - **stream**: `RichMessageDraft` (draft.ts) owns the fiddly part of
 *   `sendRichMessageDraft` — the draft is ephemeral (telegram drops it 30s after
 *   the last push) and must be closed with a real `sendRichMessage` or explicitly
 *   cancelled.
 * - **read**: type guards (guards.ts) and plain-text flattening (plaintext.ts)
 *   cover every `RichBlock`/`RichText` variant telegram can hand back.
 *
 * a handful of inline/block tags have no "corresponding to the html tag …" note in
 * the schema (marked, subscript, superscript, date_time, inline math, map,
 * reference/reference_link, table borders) — those are flagged best-effort in
 * their doc comments in inline.ts/blocks.ts. everything else is either a
 * documented tag or (for url/email/phone/bank-card/@mention/#hashtag/$cashtag/
 * /bot_command) auto-detected from plain text by telegram itself.
 */

// the full generated rich-message type surface, re-exported so consumers never
// need to reach into `@yaebal/types` directly for annotations.
export type {
	InputRichMessage,
	InputRichMessageContent,
	RichBlock,
	RichBlockAnchor,
	RichBlockAnimation,
	RichBlockAudio,
	RichBlockBlockQuotation,
	RichBlockCaption,
	RichBlockCollage,
	RichBlockDetails,
	RichBlockDivider,
	RichBlockFooter,
	RichBlockList,
	RichBlockListItem,
	RichBlockMap,
	RichBlockMathematicalExpression,
	RichBlockParagraph,
	RichBlockPhoto,
	RichBlockPreformatted,
	RichBlockPullQuotation,
	RichBlockSectionHeading,
	RichBlockSlideshow,
	RichBlockTable,
	RichBlockTableCell,
	RichBlockThinking,
	RichBlockVideo,
	RichBlockVoiceNote,
	RichMessage,
	RichText,
	RichTextAnchor,
	RichTextAnchorLink,
	RichTextBankCardNumber,
	RichTextBold,
	RichTextBotCommand,
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
	SendRichMessageDraftParams,
	SendRichMessageParams,
} from "@yaebal/types";

export {
	anchorBlock,
	audio,
	blockquote,
	type Caption,
	cell,
	collage,
	type DetailsOptions,
	details,
	divider,
	footer,
	heading,
	image,
	item,
	type ListItemOptions,
	type ListOptions,
	list,
	type MapOptions,
	type MediaOptions,
	map,
	mathBlock,
	paragraph,
	preformatted,
	pullquote,
	slideshow,
	type TableCellOptions,
	type TableOptions,
	table,
	thinking,
	video,
} from "./blocks.js";
export { RichMessageDraft, type RichMessageDraftOptions } from "./draft.js";
export {
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
export {
	anchor,
	anchorLink,
	bold,
	code,
	customEmoji,
	dateTime,
	html,
	type Insertable,
	isRichNode,
	italic,
	link,
	marked,
	math,
	type RichNode,
	reference,
	referenceLink,
	spoiler,
	strikethrough,
	subscript,
	superscript,
	textMention,
	toHtml,
	underline,
} from "./inline.js";
export { type DocumentOptions, document, markdown } from "./message.js";

export { richBlockToPlainText, richMessageToPlainText, richTextToPlainText } from "./plaintext.js";
export {
	type RichContext,
	rich,
	sendRichMessage,
	sendRichMessageDraft,
} from "./send.js";
