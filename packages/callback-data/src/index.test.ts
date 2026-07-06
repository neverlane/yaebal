import assert from "node:assert/strict";
import test from "node:test";
import { CALLBACK_DATA_LIMIT, callbackData, field } from "./index.js";

const cd = callbackData("user", { id: Number, action: String, admin: Boolean });

test("round-trips with typed coercion", () => {
	const raw = cd.pack({ id: 5, action: "ban", admin: true });
	assert.deepEqual(cd.unpack(raw), { id: 5, action: "ban", admin: true });
});

test("numbers pack as base36", () => {
	assert.equal(cd.pack({ id: 42, action: "x", admin: false }), "user:16:x:0");
	assert.deepEqual(cd.unpack("user:16:x:0"), { id: 42, action: "x", admin: false });
});

test("booleans are one byte", () => {
	assert.equal(cd.pack({ id: 1, action: "x", admin: true }), "user:1:x:1");
	assert.equal(cd.pack({ id: 1, action: "x", admin: false }), "user:1:x:0");
});

test("rejects a foreign prefix", () => {
	assert.equal(cd.unpack("other:1:x:false"), undefined);
});

test("rejects a prefix that is only a substring", () => {
	assert.equal(cd.unpack("username:1:x:0"), undefined);
	assert.equal(cd.filter("username:1"), false);
});

test("rejects wrong arity", () => {
	assert.equal(cd.unpack("user:1"), undefined);
	assert.equal(cd.unpack("user:1:x:0:extra"), undefined);
});

test("separator inside a value survives", () => {
	const raw = cd.pack({ id: 1, action: "a:b:c", admin: false });
	assert.deepEqual(cd.unpack(raw), { id: 1, action: "a:b:c", admin: false });
});

test("backslash inside a value survives", () => {
	const raw = cd.pack({ id: 1, action: "a\\b\\:c", admin: false });
	assert.deepEqual(cd.unpack(raw), { id: 1, action: "a\\b\\:c", admin: false });
});

test("empty string round-trips", () => {
	const raw = cd.pack({ id: 1, action: "", admin: false });
	assert.deepEqual(cd.unpack(raw), { id: 1, action: "", admin: false });
});

// ── totality: unpack never throws ─────────────────────────────────────────────

test("a percent sign is just a character now (the old impl threw URIError)", () => {
	assert.deepEqual(cd.unpack("user:1:%zz:1"), { id: 1, action: "%zz", admin: true });
});

test("malformed input returns undefined, never throws", () => {
	assert.equal(cd.unpack("user:1:x:maybe"), undefined); // bad boolean
	assert.equal(cd.unpack("user:!!!:x:0"), undefined); // non-numeric number → not NaN
	assert.equal(cd.unpack(""), undefined);
	assert.equal(cd.unpack("user"), undefined);
});

// ── enum ──────────────────────────────────────────────────────────────────────

test("enum stores an index and infers a union", () => {
	const e = callbackData("mod", { act: field.enum(["ban", "kick", "mute"]) });
	assert.equal(e.pack({ act: "kick" }), "mod:1");
	const parsed = e.unpack("mod:1");
	assert.deepEqual(parsed, { act: "kick" });
	// type-level: parsed?.act is "ban" | "kick" | "mute"
	const _check: ("ban" | "kick" | "mute") | undefined = parsed?.act;
	void _check;
});

test("enum rejects an out-of-range index", () => {
	const e = callbackData("mod", { act: field.enum(["ban", "kick"]) });
	assert.equal(e.unpack("mod:9"), undefined);
});

test("packing a value outside the enum throws", () => {
	const e = callbackData("mod", { act: field.enum(["ban", "kick"]) });
	// @ts-expect-error "delete" is not a member of the enum
	assert.throws(() => e.pack({ act: "delete" }), /is not one of/);
});

// ── uuid ──────────────────────────────────────────────────────────────────────

test("uuid packs to 22 base64url chars and round-trips lowercase", () => {
	const u = callbackData("u", { id: field.uuid() });
	const uuid = "01890a5d-ac96-774b-bcce-b302099a8057";

	const raw = u.pack({ id: uuid });
	const token = raw.slice("u:".length);
	assert.equal(token.length, 22); // vs 36 raw
	assert.match(token, /^[A-Za-z0-9_-]{22}$/);
	assert.deepEqual(u.unpack(raw), { id: uuid });

	// uppercase input normalizes to canonical lowercase
	assert.deepEqual(u.unpack(u.pack({ id: uuid.toUpperCase() })), { id: uuid });
});

test("uuid pack rejects a non-canonical value", () => {
	const u = callbackData("u", { id: field.uuid() });
	assert.throws(() => u.pack({ id: "not-a-uuid" }), /canonical uuid/);
	assert.throws(() => u.pack({ id: "01890a5dac96774bbcceb302099a8057" }), /canonical uuid/);
});

test("uuid decode rejects foreign tokens", () => {
	const u = callbackData("u", { id: field.uuid() });
	assert.equal(u.unpack("u:short"), undefined);
	assert.equal(u.unpack("u:!!!!!!!!!!!!!!!!!!!!!!"), undefined); // 22 chars, bad alphabet
});

// ── bigint ────────────────────────────────────────────────────────────────────

test("bigint round-trips 64-bit ids losslessly", () => {
	const b = callbackData("b", { id: field.bigint() });
	for (const v of [0n, 1n, -1n, 2n ** 63n - 1n, -(2n ** 63n), 123456789012345678901234567890n]) {
		assert.equal(b.unpack(b.pack({ id: v }))?.id, v);
	}
});

test("bigint is compact on the wire", () => {
	const b = callbackData("b", { id: field.bigint() });
	// 2^63-1 is 19 decimal digits but 13 base36 chars
	assert.equal(b.pack({ id: 2n ** 63n - 1n }), "b:1y2p0ij32e8e7");
});

test("bigint pack rejects a non-bigint, decode rejects garbage", () => {
	const b = callbackData("b", { id: field.bigint() });
	// @ts-expect-error number is not bigint
	assert.throws(() => b.pack({ id: 5 }), /must be a bigint/);
	assert.equal(b.unpack("b:$$$"), undefined);
	assert.equal(b.unpack("b:-"), undefined);
});

// ── optional + default + schema evolution ─────────────────────────────────────

test("optional field may be absent", () => {
	const cd2 = callbackData("p", { id: Number, note: field.string().optional() });
	assert.deepEqual(cd2.unpack(cd2.pack({ id: 1 })), { id: 1 });
	assert.deepEqual(cd2.unpack(cd2.pack({ id: 1, note: "hi" })), { id: 1, note: "hi" });
});

test("default fills an absent optional on unpack", () => {
	const cd2 = callbackData("p", { id: Number, page: field.number().default(1) });
	assert.deepEqual(cd2.unpack(cd2.pack({ id: 1 })), { id: 1, page: 1 });
	assert.deepEqual(cd2.unpack(cd2.pack({ id: 1, page: 3 })), { id: 1, page: 3 });
});

test("appending an optional field is backward-compatible", () => {
	const v1 = callbackData("p", { id: Number });
	const v2 = callbackData("p", { id: Number, extra: field.string().optional() });
	// a button packed by v1 still decodes under v2
	assert.deepEqual(v2.unpack(v1.pack({ id: 7 })), { id: 7 });
});

test("appending an enum member preserves old indices", () => {
	const v1 = callbackData("p", { act: field.enum(["a", "b"]) });
	const v2 = callbackData("p", { act: field.enum(["a", "b", "c"]) });
	assert.deepEqual(v2.unpack(v1.pack({ act: "b" })), { act: "b" });
});

// ── pack-time guards ──────────────────────────────────────────────────────────

test("pack throws on a missing required field", () => {
	// @ts-expect-error action is required
	assert.throws(() => cd.pack({ id: 1, admin: false }), /required field "action"/);
});

test("pack throws on a non-finite number", () => {
	assert.throws(() => cd.pack({ id: Number.NaN, action: "x", admin: false }), /finite number/);
});

test("pack refuses an unsafe integer instead of corrupting it", () => {
	// 2^53 packs as a decimal string that decode would misread as base36
	assert.throws(() => cd.pack({ id: 2 ** 53, action: "x", admin: false }), /MAX_SAFE_INTEGER/);
});

test("floats round-trip exactly", () => {
	for (const v of [1.5, -0.25, 0.30000000000000004, 1e21, 1e-7]) {
		assert.equal(cd.unpack(cd.pack({ id: v, action: "x", admin: false }))?.id, v);
	}
});

test("an over-safe base36 token is foreign data, not a number", () => {
	// 12 base36 chars parse past 2^53 — our pack never emits that
	assert.equal(cd.unpack("user:zzzzzzzzzzzz:x:0"), undefined);
});

test("pack throws when the payload exceeds the byte limit", () => {
	assert.throws(
		() => cd.pack({ id: 1, action: "x".repeat(80), admin: false }),
		/exceeds the 64-byte limit/,
	);
});

test("the byte limit can be raised", () => {
	const big = callbackData("x", { s: String }, { maxBytes: Number.POSITIVE_INFINITY });
	assert.ok(big.pack({ s: "y".repeat(200) }).length > CALLBACK_DATA_LIMIT);
});

// ── compactness ───────────────────────────────────────────────────────────────

test("non-ascii strings stay raw (no percent-encoding bloat)", () => {
	const raw = cd.pack({ id: 1, action: "привет", admin: false });
	assert.ok(raw.includes("привет"));
});

// ── prefix / pattern / filter ─────────────────────────────────────────────────

test("rejects a prefix containing a reserved char", () => {
	assert.throws(() => callbackData("a:b", { x: Number }), /must not contain/);
	assert.throws(() => callbackData("a\\b", { x: Number }), /must not contain/);
});

test("rejects an empty prefix (telegram needs 1-64 bytes)", () => {
	assert.throws(() => callbackData("", {}), /must not be empty/);
});

test("pattern/filter matches its own namespace", () => {
	assert.ok(cd.filter(cd.pack({ id: 1, action: "x", admin: false })));
	assert.equal(cd.filter("nope:1"), false);
	assert.equal(cd.filter(undefined), false);
});

test("prefix-only schema matches exactly", () => {
	const ping = callbackData("ping", {});
	assert.equal(ping.pack(), "ping");
	assert.equal(ping.pack({}), "ping");
	assert.deepEqual(ping.unpack("ping"), {});
	assert.ok(ping.filter("ping"));
	assert.equal(ping.unpack("pinger"), undefined);
});

// ── extend ────────────────────────────────────────────────────────────────────

test("extend appends fields immutably", () => {
	const base = callbackData("cart", { id: Number });
	const withOp = base.extend({ op: field.enum(["add", "remove"]) });
	assert.deepEqual(withOp.unpack(withOp.pack({ id: 3, op: "add" })), { id: 3, op: "add" });
	// original is untouched — still 1 field
	assert.equal(base.unpack("cart:3:0"), undefined);
	assert.deepEqual(base.unpack("cart:3"), { id: 3 });
});
