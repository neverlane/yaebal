import type { LinkPreviewOptions } from "@yaebal/types";

export type { LinkPreviewOptions } from "@yaebal/types";

/**
 * fluent builder for telegram's `link_preview_options` — pass `.build()` to `sendMessage`,
 * `editMessageText`, or any other method that takes `link_preview_options`.
 */
export class LinkPreview {
	#options: LinkPreviewOptions = {};

	/** url to preview. if omitted, telegram uses the first url found in the message text. */
	url(url: string): this {
		this.#options.url = url;
		return this;
	}

	/** hides the preview entirely. */
	disable(disabled = true): this {
		this.#options.is_disabled = disabled;
		return this;
	}

	/** shrinks the preview media; ignored if the url isn't set or resizing isn't supported for it. */
	preferSmallMedia(value = true): this {
		this.#options.prefer_small_media = value;
		return this;
	}

	/** enlarges the preview media; ignored if the url isn't set or resizing isn't supported for it. */
	preferLargeMedia(value = true): this {
		this.#options.prefer_large_media = value;
		return this;
	}

	/** shows the preview above the message text instead of below it. */
	showAboveText(value = true): this {
		this.#options.show_above_text = value;
		return this;
	}

	/** returns the plain `LinkPreviewOptions` object. */
	build(): LinkPreviewOptions {
		return { ...this.#options };
	}

	/** lets `JSON.stringify` (and thus `Api`) accept the builder directly. */
	toJSON(): LinkPreviewOptions {
		return this.build();
	}
}

/** starts a new `LinkPreview` builder; `linkPreview(url)` is shorthand for `new LinkPreview().url(url)`. */
export function linkPreview(url?: string): LinkPreview {
	const preview = new LinkPreview();
	return url === undefined ? preview : preview.url(url);
}

/** shorthand for `{ is_disabled: true }`, when there's nothing else to configure. */
export function disableLinkPreview(): LinkPreviewOptions {
	return { is_disabled: true };
}
