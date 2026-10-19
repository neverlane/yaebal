// one-off: re-derives each field's `enum` and `description` from the live docs into the
// already-committed schema.json, without touching anything else — not a full
// `update-schema.mjs` run, so it can't pick up unrelated drift or touch package versions.
// it backfills two parser changes: single-value discriminators (`always “user”`, `must be
// <em>chat</em>`) now become one-literal enums, and emoji drawn as <img alt> in descriptions
// survive. parse-schema.mjs emits both itself, so ordinary future `update-schema.mjs` runs
// carry them; this exists only for a schema.json that predates the change.
//
// run: node scripts/backfill-field-enums.mjs && node scripts/generate.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fetchApiHtml, parseSchema } from "./lib/parse-schema.mjs";

const root = new URL("../", import.meta.url);
const schemaPath = new URL("schema.json", root);

const fieldsOf = (entry) => entry.arguments ?? entry.properties ?? entry.fields ?? [];

async function main() {
	const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

	console.log("fetching https://core.telegram.org/bots/api ...");
	const live = parseSchema(await fetchApiHtml());

	const liveFields = new Map();
	for (const entry of [...live.methods, ...live.objects]) {
		for (const field of fieldsOf(entry)) liveFields.set(`${entry.name}.${field.name}`, field);
	}

	let enums = 0;
	let descriptions = 0;
	for (const entry of [...schema.methods, ...schema.objects]) {
		for (const field of fieldsOf(entry)) {
			const fresh = liveFields.get(`${entry.name}.${field.name}`);
			if (!fresh) continue;

			if (fresh.enum && JSON.stringify(fresh.enum) !== JSON.stringify(field.enum)) {
				field.enum = fresh.enum;
				enums++;
			}
			if (fresh.description !== field.description) {
				field.description = fresh.description;
				descriptions++;
			}
		}
	}

	writeFileSync(schemaPath, JSON.stringify(schema));
	console.log(`updated ${enums} field enum(s) and ${descriptions} description(s)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
