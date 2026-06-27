import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "./index.js";

const cd = callbackData("user", { id: Number, action: String, admin: Boolean });

test("round-trips with typed coercion", () => {
	const raw = cd.pack({ id: 5, action: "ban", admin: true });
	assert.equal(raw, "user:5:ban:true");
	assert.deepEqual(cd.unpack(raw), { id: 5, action: "ban", admin: true });
});

test("rejects a foreign prefix", () => {
	assert.equal(cd.unpack("other:1:x:false"), undefined);
});

test("rejects wrong arity", () => {
	assert.equal(cd.unpack("user:1"), undefined);
});

test("separator inside a value survives encoding", () => {
	const raw = cd.pack({ id: 1, action: "a:b:c", admin: false });
	assert.deepEqual(cd.unpack(raw), { id: 1, action: "a:b:c", admin: false });
});

test("pattern/filter matches its own namespace", () => {
	assert.ok(cd.filter(cd.pack({ id: 1, action: "x", admin: false })));
	assert.equal(cd.filter("nope:1"), false);
	assert.equal(cd.filter(undefined), false);
});

test("rejects a prefix containing the separator", () => {
	assert.throws(() => callbackData("a:b", { x: Number }), /must not contain ":"/);
});

test("prefix-only schema matches exactly", () => {
	const ping = callbackData("ping", {});
	assert.equal(ping.pack({}), "ping");
	assert.deepEqual(ping.unpack("ping"), {});
	assert.ok(ping.filter("ping"));
	assert.equal(ping.unpack("pinger"), undefined);
});
