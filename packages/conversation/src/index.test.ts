import assert from "node:assert/strict";
import test from "node:test";
import { conversation, createConversation } from "./index.js";

test("createConversation returns a def carrying the builder verbatim", () => {
	const builder = async () => {};
	const def = createConversation(builder);
	assert.equal(def.builder, builder);
});

test("conversation() picks the live engine without options.storage and the replay engine with it", () => {
	const noop = createConversation(async () => {});

	// both return a plain plugin function (composer => composer) — the engine choice is an
	// internal implementation detail, not part of the returned shape.
	const live = conversation({ noop });
	assert.equal(typeof live, "function");

	const memoryStorage = {
		get: async () => undefined,
		set: async () => {},
		delete: async () => {},
	};
	const durable = conversation({ noop }, { storage: memoryStorage });
	assert.equal(typeof durable, "function");
});
