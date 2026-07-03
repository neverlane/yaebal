import type { InputRichMessage } from "@yaebal/types";
import type { Dialect } from "./node.js";

/**
 * the emitted rich message — a rendered dialect string plus the
 * `InputRichMessage` flags, settable fluently (`.rtl()`, `.noEntityDetection()`).
 *
 * `sendRichMessage`/`RichMessageDraft` accept it directly, and `toJSON()`
 * delegates to `toInputRichMessage()`, so even a raw `api.call` payload holding
 * a `RichDocument` serializes into the correct `rich_message` shape.
 */
export class RichDocument {
	#isRtl?: boolean;
	#skipEntityDetection?: boolean;

	constructor(
		readonly dialect: Dialect,
		readonly content: string,
	) {}

	/** `InputRichMessage.is_rtl` — show the message right-to-left. */
	rtl(value = true): this {
		this.#isRtl = value;
		return this;
	}

	/**
	 * `InputRichMessage.skip_entity_detection` — turn off auto-detection of urls,
	 * emails, `@mentions`, `#hashtags`, `$cashtags`, `/bot_commands`, and phone
	 * numbers in plain text.
	 */
	noEntityDetection(value = true): this {
		this.#skipEntityDetection = value;
		return this;
	}

	/** the `rich_message` method argument: `{ [dialect]: content, is_rtl?, skip_entity_detection? }`. */
	toInputRichMessage(): InputRichMessage {
		return {
			[this.dialect]: this.content,
			...(this.#isRtl !== undefined ? { is_rtl: this.#isRtl } : {}),
			...(this.#skipEntityDetection !== undefined
				? { skip_entity_detection: this.#skipEntityDetection }
				: {}),
		};
	}

	toJSON(): InputRichMessage {
		return this.toInputRichMessage();
	}
}
