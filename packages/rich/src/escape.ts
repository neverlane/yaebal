/** escape text so it can never be re-parsed as a tag or entity. */
export function escapeText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** escape a double-quoted attribute value. */
export function escapeAttr(value: string): string {
	return escapeText(value).replace(/"/g, "&quot;");
}
