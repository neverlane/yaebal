import type { InputRichMessage } from "@yaebal/types";
import type { Insertable } from "./inline.js";
import { toHtml } from "./inline.js";

export interface DocumentOptions {
	/** `InputRichMessage.is_rtl` — show the message right-to-left. */
	rtl?: boolean;
	/**
	 * `InputRichMessage.skip_entity_detection` — turn off auto-detection of urls,
	 * emails, `@mentions`, `#hashtags`, `$cashtags`, `/bot_commands`, and phone
	 * numbers in plain text.
	 */
	skipEntityDetection?: boolean;
}

/**
 * assemble top-level blocks (from blocks.ts) into an `InputRichMessage.html`
 * payload. pass the result straight to `sendRichMessage`/`sendRichMessageDraft`
 * or a `RichMessageDraft`.
 */
export function document(blocks: Insertable[], options: DocumentOptions = {}): InputRichMessage {
	return {
		html: blocks.map(toHtml).join(""),
		...(options.rtl !== undefined ? { is_rtl: options.rtl } : {}),
		...(options.skipEntityDetection !== undefined
			? { skip_entity_detection: options.skipEntityDetection }
			: {}),
	};
}

/**
 * a raw markdown payload — telegram parses `InputRichMessage.markdown` the same
 * way as `html`, but the extended block syntax (tables, `tg-thinking`, …) is not
 * documented in markdown form, so unlike `document()` this has no builder: pass a
 * literal string.
 */
export function markdown(source: string, options: DocumentOptions = {}): InputRichMessage {
	return {
		markdown: source,
		...(options.rtl !== undefined ? { is_rtl: options.rtl } : {}),
		...(options.skipEntityDetection !== undefined
			? { skip_entity_detection: options.skipEntityDetection }
			: {}),
	};
}
