// wraps type-name identifiers inside a rendered type string (e.g. "Message | boolean",
// "InlineKeyboardButton[]") with links to their own /docs/api/{methods,types}/<name> page,
// when that identifier is a known Bot API method or type.

import { apiMethodsByName, apiTypesByName } from "./data.generated";

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

export function linkifyType(type: string): string {
	return type.replace(IDENTIFIER, (name) => {
		if (apiTypesByName.has(name)) return `<a href="/docs/api/types/${name}">${name}</a>`;
		if (apiMethodsByName.has(name)) return `<a href="/docs/api/methods/${name}">${name}</a>`;

		return name;
	});
}
