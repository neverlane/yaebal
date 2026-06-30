import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadRoutes, type RouteTarget, routeFromFile } from "./index.js";

test("routeFromFile maps commands and dotted on-queries", () => {
	assert.deepEqual(routeFromFile("commands", "start.js"), { method: "command", trigger: "start" });
	assert.deepEqual(routeFromFile("on", "message.text.js"), {
		method: "on",
		trigger: "message:text",
	});

	assert.deepEqual(routeFromFile("on", "callback_query.data.ts"), {
		method: "on",
		trigger: "callback_query:data",
	});

	assert.deepEqual(routeFromFile("on", "message.js"), { method: "on", trigger: "message" });
});

test("loadRoutes registers handlers from the routes directory", async () => {
	const calls: string[] = [];
	const bot: RouteTarget = {
		command: (name) => calls.push(`command:${name}`),
		on: (query) => calls.push(`on:${query}`),
	};

	const dir = fileURLToPath(new URL("./__fixtures__/routes", import.meta.url));

	const registered = await loadRoutes(bot, dir);

	assert.deepEqual(registered.sort(), ["command:start", "on:message:text"]);
	assert.deepEqual(calls.sort(), ["command:start", "on:message:text"]);
});

test("loadRoutes is a no-op for a missing directory", async () => {
	const bot: RouteTarget = {
		command: () => assert.fail("should not register"),
		on: () => assert.fail("should not register"),
	};

	const registered = await loadRoutes(bot, "/no/such/dir/here");
	assert.deepEqual(registered, []);
});
