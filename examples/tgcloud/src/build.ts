import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleTgcloud } from "@yaebal/tgcloud";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const result = await bundleTgcloud({
	input: join(here, "bot.ts"),
	root,
	keepLogs: true,
});

// schema.js is not a handler. the platform loads it on its own to migrate the
// database, so it has to stay source — `sdk/db` and all.
const schemaDir = join(root, "tgcloud");
await mkdir(schemaDir, { recursive: true });
await cp(join(here, "schema.ts"), join(schemaDir, "schema.js"));

console.log(`wrote ${result.handlers.join(", ")} and schema.js to ${result.dir}`);
console.log("next: npx tgcloud login && npx tgcloud push && npx tgcloud migrate");
