import { type FormatFieldSpec, formatFields } from "@yaebal/types";
import { isFormatResult } from "./format.js";

/**
 * split every `format`/`fmt` result in a method's params into plain text + its
 * `*_entities` sibling, wherever the schema says formatted text can live —
 * including nested spots (`reply_parameters.quote`, poll options, media groups,
 * inline results, checklists, …). driven by the code-generated
 * {@link formatFields} map, so a new Bot API release covers new methods by
 * regenerating types, not by hand-listing them.
 *
 * the api client applies this to every outgoing call, which is what lets
 * `bot.api.sendMessage({ text: format`…` })` — or any other method — accept a
 * formatted value directly. copy-on-write: params are never mutated, and an
 * explicitly passed entities param always wins.
 */
export function applyFormatFields(
	method: string,
	params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	const sites = formatFields[method];
	if (!sites || !params) return params;

	return applySites(params, sites) as Record<string, unknown>;
}

function applySites(value: unknown, sites: readonly FormatFieldSpec[]): unknown {
	if (Array.isArray(value)) {
		let changed = false;

		const out = value.map((item) => {
			const next = applySites(item, sites);
			if (next !== item) changed = true;
			return next;
		});

		return changed ? out : value;
	}

	if (typeof value !== "object" || value === null) return value;

	const source = value as Record<string, unknown>;
	let out = source;
	const set = (key: string, next: unknown) => {
		if (out === source) out = { ...source };
		out[key] = next;
	};

	for (const site of sites) {
		const field = out[site.field];
		if (field === undefined || field === null) continue;

		if (site.entities !== undefined) {
			if (isFormatResult(field)) {
				set(site.field, field.text);
				if (out[site.entities] === undefined && field.entities.length > 0) {
					set(site.entities, field.entities);
				}
			}
		} else if (site.nested) {
			const next = applySites(field, site.nested);
			if (next !== field) set(site.field, next);
		}
	}

	return out;
}
