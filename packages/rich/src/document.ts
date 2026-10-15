import type { InputRichMessage, InputRichMessageMedia } from "@yaebal/types";
import type { Dialect } from "./node.js";
import { RichError } from "./node.js";

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
	#media: InputRichMessageMedia[] = [];

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

	/** attach media referenced by `tg://photo|video|audio|document?id=…` in the content. */
	media(...entries: InputRichMessageMedia[]): this {
		const ids = new Set(this.#media.map((entry) => entry.id));
		for (const entry of entries) {
			if (!/^[A-Za-z0-9_-]{1,64}$/.test(entry.id)) {
				throw new RichError("RichDocument.media(): ids must be 1-64 letters, digits, _ or -");
			}
			if (ids.has(entry.id))
				throw new RichError(`RichDocument.media(): duplicate id "${entry.id}"`);
			ids.add(entry.id);
		}
		this.#media.push(...entries.map((entry) => ({ ...entry, media: { ...entry.media } })));
		return this;
	}

	/** the `rich_message` method argument: `{ [dialect]: content, is_rtl?, skip_entity_detection? }`. */
	toInputRichMessage(): InputRichMessage {
		return {
			[this.dialect]: this.content,
			...(this.#media.length
				? { media: this.#media.map((entry) => ({ ...entry, media: { ...entry.media } })) }
				: {}),
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
