import assert from "node:assert/strict";
import test from "node:test";
import { parseWebAppData } from "./web-app-data.js";

test("parseWebAppData: parses the JSON payload, throws on malformed data", () => {
	assert.deepEqual(parseWebAppData<{ action: string }>(JSON.stringify({ action: "buy" })), {
		action: "buy",
	});
	assert.throws(() => parseWebAppData("{not json"), /not valid JSON/);
});
