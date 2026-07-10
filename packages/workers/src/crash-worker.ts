import { appendFileSync } from "node:fs";
import { workerData } from "node:worker_threads";

// fixture for the respawn/fork-bomb regression tests: record the spawn, then die at load.
appendFileSync((workerData as { log: string }).log, "spawn\n");
throw new Error("boom at load");
