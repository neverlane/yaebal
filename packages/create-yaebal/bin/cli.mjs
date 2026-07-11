#!/usr/bin/env node
import { main } from "../lib/index.js";

main().catch((err) => {
	console.error(
		"\x1b[31m✗ create-yaebal crashed:\x1b[0m",
		err instanceof Error ? err.message : err,
	);
	if (process.env.YAEBAL_DEBUG) console.error(err);
	process.exitCode = 1;
});
