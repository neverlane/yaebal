// one-off: adds the `category` field (the official docs' <h3> section, e.g. "Available
// methods") to the already-committed schema.json, without touching anything else — not a
// full `update-schema.mjs` run, so it can't also pick up unrelated live-docs drift or bump
// package versions. `category` is now emitted by parse-schema.mjs itself, so ordinary future
// `update-schema.mjs` runs carry it automatically; this script exists only to backfill the
// field onto a schema.json that predates that change.
//
// run: node scripts/backfill-categories.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fetchApiHtml, parseSchema } from "./lib/parse-schema.mjs";

const root = new URL("../", import.meta.url);
const schemaPath = new URL("schema.json", root);

async function main() {
	const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

	console.log("fetching https://core.telegram.org/bots/api ...");
	const html = await fetchApiHtml();
	const live = parseSchema(html);

	const liveMethods = new Map(live.methods.map((m) => [m.name, m.category]));
	const liveObjects = new Map(live.objects.map((o) => [o.name, o.category]));

	let matched = 0;
	let missing = 0;

	for (const m of schema.methods) {
		const category = liveMethods.get(m.name);
		if (category === undefined) {
			console.warn(`no category found for method "${m.name}" (not in live docs?)`);
			missing++;
			continue;
		}
		m.category = category;
		matched++;
	}

	for (const o of schema.objects) {
		const category = liveObjects.get(o.name);
		if (category === undefined) {
			console.warn(`no category found for object "${o.name}" (not in live docs?)`);
			missing++;
			continue;
		}
		o.category = category;
		matched++;
	}

	schema.category_order = live.category_order;

	writeFileSync(schemaPath, JSON.stringify(schema));
	console.log(`backfilled category on ${matched} entries (${missing} unmatched) — wrote schema.json`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
