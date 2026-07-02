/** escape text so it can never be re-parsed as a tag or entity. */
export function escapeText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** escape a double-quoted attribute value. */
export function escapeAttr(value: string): string {
	return escapeText(value).replace(/"/g, "&quot;");
}

// rich-markdown specials. `&`/`<`/`>` become numeric entities (rich-markdown renders
// `\<` with the backslash showing, but does accept entities — the same trick telegram's
// classic parse_mode markdown uses); everything else backslash-escapes cleanly.
const MARKDOWN_SPECIALS = /[\\`*_~=|[\]()#!+\-&<>]/g;
const MARKDOWN_ENTITY: Record<string, string> = { "&": "&#38;", "<": "&#60;", ">": "&#62;" };

/** escape text so it can never be re-parsed as rich-markdown syntax. */
export function escapeMarkdown(value: string): string {
	return value.replace(MARKDOWN_SPECIALS, (ch) => MARKDOWN_ENTITY[ch] ?? `\\${ch}`);
}

/**
 * escape a url used as a markdown link destination. `[text](url)` is terminated by `)`
 * or whitespace, so an attacker-controlled url can't break out of the link — escape the
 * parens/backslash and percent-encode whitespace.
 */
export function escapeMarkdownUrl(value: string): string {
	return value.replace(/[\\()]/g, "\\$&").replace(/\s/g, (ch) => encodeURIComponent(ch));
}
