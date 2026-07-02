import type {
	RichBlock,
	RichBlockAnimation,
	RichBlockAudio,
	RichBlockBlockQuotation,
	RichBlockCaption,
	RichBlockCollage,
	RichBlockDetails,
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
	RichMessage,
	RichText,
	RichTextCustomEmoji,
	RichTextMathematicalExpression,
} from "@yaebal/types";

/**
 * the schema documents `RichText` fields as "either a String for plain text, an
 * Array of RichText, or" one of the marked-up variants — but the generated
 * `RichText` type only lists the object variants. widen locally so plain-string
 * leaves (by far the common case) don't need a cast at every call site.
 */
type RichTextLike = RichText | string | RichTextLike[] | undefined;

/**
 * every generated `.type` field is plain `string`, not a literal — so unlike a
 * normal discriminated union, `switch (x.type)` narrows the *string*, not `x`
 * itself, and (worse) several `RichBlock`/`RichText` interfaces are structurally
 * identical (e.g. `RichBlockParagraph`/`RichBlockFooter`/`RichBlockThinking` are
 * all just `{ type; text }`), which makes typescript's guard-based negative
 * narrowing collapse to `never` if you lean on it across a chain. so: switch on
 * the string, cast once per case instead of narrowing.
 */
function as<T>(value: unknown): T {
	return value as T;
}

/** flatten a `RichText` field (bold/link/spoiler/…) down to its plain characters. */
export function richTextToPlainText(text: RichTextLike): string {
	if (text === undefined) return "";
	if (typeof text === "string") return text;
	if (Array.isArray(text)) return text.map(richTextToPlainText).join("");

	switch (text.type) {
		case "custom_emoji":
			return as<RichTextCustomEmoji>(text).alternative_text;
		case "mathematical_expression":
			return as<RichTextMathematicalExpression>(text).expression;
		case "anchor":
			return "";
		// every remaining variant wraps a nested `text` field (bold, italic, url,
		// mention, hashtag, date_time, reference, anchor_link, text_mention, …).
		default:
			return richTextToPlainText(as<{ text?: RichTextLike }>(text).text);
	}
}

function captionToPlainText(caption: RichBlockCaption | undefined): string {
	if (!caption) return "";

	const credit = caption.credit ? ` (${richTextToPlainText(caption.credit)})` : "";
	return `${richTextToPlainText(caption.text)}${credit}\n`;
}

/** flatten one `RichBlock` (and its nested blocks) down to plain text, one block per line. */
export function richBlockToPlainText(block: RichBlock): string {
	switch (block.type) {
		case "paragraph":
			return `${richTextToPlainText(as<RichBlockParagraph>(block).text)}\n`;
		case "heading":
			return `${richTextToPlainText(as<RichBlockSectionHeading>(block).text)}\n`;
		case "pre":
			return `${richTextToPlainText(as<RichBlockPreformatted>(block).text)}\n`;
		case "footer":
			return `${richTextToPlainText(as<RichBlockFooter>(block).text)}\n`;
		case "thinking":
			return `${richTextToPlainText(as<RichBlockThinking>(block).text)}\n`;
		case "divider":
			return "---\n";
		case "anchor":
			return "";
		case "mathematical_expression":
			return `${as<RichBlockMathematicalExpression>(block).expression}\n`;
		case "list": {
			const { items } = as<RichBlockList>(block);
			return `${items
				.map((entry) => `- ${entry.blocks.map(richBlockToPlainText).join("").trim()}`)
				.join("\n")}\n`;
		}
		case "blockquote": {
			const { blocks, credit } = as<RichBlockBlockQuotation>(block);
			return `${blocks.map(richBlockToPlainText).join("")}${credit ? ` — ${richTextToPlainText(credit)}` : ""}\n`;
		}
		case "pullquote": {
			const { text, credit } = as<RichBlockPullQuotation>(block);
			return `${richTextToPlainText(text)}${credit ? ` — ${richTextToPlainText(credit)}` : ""}\n`;
		}
		case "collage":
		case "slideshow": {
			const { blocks, caption } = as<RichBlockCollage | RichBlockSlideshow>(block);
			return `${blocks.map(richBlockToPlainText).join("")}${captionToPlainText(caption)}`;
		}
		case "table": {
			const { cells } = as<RichBlockTable>(block);
			return `${cells.map((row) => row.map((c) => richTextToPlainText(c.text)).join(" | ")).join("\n")}\n`;
		}
		case "details": {
			const { summary, blocks } = as<RichBlockDetails>(block);
			return `${richTextToPlainText(summary)}\n${blocks.map(richBlockToPlainText).join("")}`;
		}
		case "map":
			return captionToPlainText(as<RichBlockMap>(block).caption);
		case "animation":
		case "audio":
		case "photo":
		case "video":
		case "voice_note": {
			const { caption } = as<
				RichBlockAnimation | RichBlockAudio | RichBlockPhoto | RichBlockVideo | RichBlockVoiceNote
			>(block);
			return captionToPlainText(caption);
		}
		default:
			return "";
	}
}

/** flatten a whole `RichMessage.blocks` tree to plain text — search indices, logs, notifications. */
export function richMessageToPlainText(message: RichMessage): string {
	return message.blocks.map(richBlockToPlainText).join("").trim();
}
