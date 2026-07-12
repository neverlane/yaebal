import assert from "node:assert/strict";
import test from "node:test";
import {
	checkCommandName,
	checkFilenameMatch,
	checkOnQuery,
	closestMatch,
	DuplicateTracker,
	levenshtein,
} from "./validate.js";

test("levenshtein: identical strings are distance 0", () => {
	assert.equal(levenshtein("message", "message"), 0);
});

test("levenshtein: one substitution/typo", () => {
	assert.equal(levenshtein("mesage", "message"), 1);
});

test("levenshtein: against an empty string is the other string's length", () => {
	assert.equal(levenshtein("", "abc"), 3);
	assert.equal(levenshtein("abc", ""), 3);
});

test("closestMatch: finds a near typo", () => {
	assert.equal(closestMatch("mesage", ["message", "channel_post", "callback_query"]), "message");
});

test("closestMatch: no suggestion when nothing is close enough", () => {
	assert.equal(closestMatch("photo", ["message", "channel_post", "callback_query"]), undefined);
});

test("checkCommandName: accepts the telegram-legal alphabet", () => {
	assert.equal(checkCommandName("start"), null);
	assert.equal(checkCommandName("help_v2"), null);
	assert.equal(checkCommandName("a".repeat(32)), null);
});

test("checkCommandName: rejects uppercase, punctuation, and over-length names", () => {
	assert.ok(checkCommandName("Start"));
	assert.ok(checkCommandName("start-now"));
	assert.ok(checkCommandName(""));
	assert.ok(checkCommandName("a".repeat(33)));
});

test("checkOnQuery: accepts a real update type, with or without fields", () => {
	const valid = ["message", "callback_query", "channel_post"];
	assert.equal(checkOnQuery("message", valid), null);
	assert.equal(checkOnQuery("message:text", valid), null);
});

test("checkOnQuery: rejects a typo'd update type and suggests the closest one", () => {
	const valid = ["message", "callback_query", "channel_post"];
	const error = checkOnQuery("mesage:text", valid);

	assert.ok(error);
	assert.match(error, /"mesage"/);
	assert.match(error, /did you mean "message"/);
});

test("DuplicateTracker: flags a second file claiming the same key", () => {
	const dup = new DuplicateTracker();
	assert.equal(dup.check("start", "commands/start.js"), null);
	assert.equal(dup.check("help", "commands/help.js"), null);

	const error = dup.check("start", "commands/start2.js");
	assert.ok(error);
	assert.match(error, /commands\/start\.js/);
});

test("DuplicateTracker: the same file re-claiming its own key is not a duplicate", () => {
	const dup = new DuplicateTracker();
	assert.equal(dup.check("start", "commands/start.js"), null);
	assert.equal(dup.check("start", "commands/start.js"), null);
});

test("checkFilenameMatch: agreement is silent, disagreement explains both sides", () => {
	assert.equal(checkFilenameMatch("start", "start"), null);

	const error = checkFilenameMatch("start", "begin");
	assert.ok(error);
	assert.match(error, /"start"/);
	assert.match(error, /"begin"/);
});
