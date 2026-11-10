import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { callbackData, field } from "@yaebal/callback-data";
import {
	describeActions,
	type WidgetClientApi,
	widgetClient,
	widgetClientSource,
} from "./client.js";
import { measureHtml } from "./size.js";
import { widgetState } from "./state.js";

const vote = callbackData("vote", {
	option: field.enum(["pizza", "sushi", 7]),
	weight: field.number().optional(),
	note: field.string().optional(),
});
const everything = callbackData("all", {
	s: String,
	n: Number,
	b: Boolean,
	u: field.uuid(),
	big: field.bigint(),
	opt: field.boolean().optional(),
});
const bare = callbackData("ping", {});

/** objects built inside the vm have another realm's prototypes — compare as plain json. */
const plain = (value: unknown): unknown =>
	value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const V0 = vote.pack({ option: "pizza" });
const V1 = vote.pack({ option: "sushi" });

interface Stub {
	publicData: string | null;
	chatData: string | null;
	wallet: unknown;
	requests: { data: string; options?: unknown }[];
	handlers: Record<string, (() => void)[]>;
	watching: number;
	reply: (data: string) => Promise<{ result: string | null }>;
	fire(type: string): void;
}

function stub(): Stub {
	const s: Stub = {
		publicData: null,
		chatData: null,
		wallet: null,
		requests: [],
		handlers: {},
		watching: 0,
		reply: async () => ({ result: null }),
		fire(type) {
			for (const h of s.handlers[type] ?? []) h();
		},
	};
	return s;
}

/** run the runtime in a fresh context; `widget` = the TelegramWidget stub, or none (a browser). */
function boot(source: string, widget?: Stub, global = "yw"): WidgetClientApi {
	const window: Record<string, unknown> = {};
	if (widget) {
		window.TelegramWidget = {
			get publicData() {
				return widget.publicData;
			},
			get chatData() {
				return widget.chatData;
			},
			get wallet() {
				return widget.wallet;
			},
			request(data: string, options?: unknown) {
				widget.requests.push({ data, options });
				return widget.reply(data);
			},
			onEvent(type: string, fn: () => void) {
				widget.handlers[type] = [...(widget.handlers[type] ?? []), fn];
			},
			offEvent(type: string, fn: () => void) {
				widget.handlers[type] = (widget.handlers[type] ?? []).filter((h) => h !== fn);
			},
			watchPublicData() {
				widget.watching++;
			},
			unwatchPublicData() {
				widget.watching--;
			},
		};
	}
	runInNewContext(source, { window, TextEncoder, btoa });
	return window[global] as WidgetClientApi;
}

test("pack matches @yaebal/callback-data byte for byte, so the bot's unpack accepts it", () => {
	const yw = boot(widgetClientSource({ actions: { vote, everything, bare } }));
	type Ns = { pack(data: never): string; unpack(raw: string): unknown };
	const cases: [string, Record<string, unknown>, Ns][] = [
		["vote", { option: "sushi" }, vote],
		["vote", { option: 7, weight: 3 }, vote],
		["vote", { option: "pizza", weight: -1.5, note: "a:b\\c" }, vote],
		["vote", { option: "pizza", note: "only note" }, vote],
		[
			"everything",
			{
				s: "x:y",
				n: 1234567,
				b: false,
				u: "123e4567-e89b-12d3-a456-426614174000",
				big: 2n ** 70n,
				opt: true,
			},
			everything,
		],
		[
			"everything",
			{ s: "", n: 0.25, b: 1, u: "00000000-0000-0000-0000-000000000000", big: -5n },
			everything,
		],
		["bare", {}, bare],
	];
	for (const [action, data, ns] of cases) {
		const packed = yw.pack(action, data);
		assert.equal(
			packed,
			(ns.pack as (d: unknown) => string)(data),
			`${action} ${JSON.stringify(data, (_, v) => (typeof v === "bigint" ? `${v}n` : v))}`,
		);
		assert.notEqual(ns.unpack(packed), undefined);
	}
	assert.equal(yw.pack("bare"), "ping");
	assert.deepEqual(vote.unpack(yw.pack("vote", { option: "sushi", note: "n" })), {
		option: "sushi",
		note: "n",
	});
	assert.equal(yw.pack("vote", { option: "pizza" }), V0);
});

test("pack rejects what callback-data would reject", () => {
	const yw = boot(widgetClientSource({ actions: { vote, everything } }));
	assert.throws(() => yw.pack("nope"), /action nope/);
	assert.throws(() => yw.pack("vote", {}), /option: required/);
	assert.throws(() => yw.pack("vote", { option: "tea" }), /option: enum/);
	assert.throws(() => yw.pack("vote", { option: "pizza", weight: Number.NaN }), /weight: number/);
	assert.throws(() => yw.pack("vote", { option: "pizza", weight: 2 ** 60 }), /weight: unsafe/);
	assert.throws(() => yw.pack("vote", { option: "pizza", note: 5 }), /note: string/);
	assert.throws(() => yw.pack("vote", { option: "pizza", note: "x".repeat(80) }), /bytes > 64/);
	const base = { s: "", n: 1, b: true, u: "123e4567-e89b-12d3-a456-426614174000", big: 1n };
	assert.throws(() => yw.pack("everything", { ...base, u: "nope" }), /u: uuid/);
	assert.throws(() => yw.pack("everything", { ...base, big: 1 }), /big: bigint/);
	// without a uuid field the codec isn't shipped, and a stray uuid type fails loudly
	const fake = {
		describe: () => ({
			prefix: "f",
			maxBytes: 64,
			required: [{ key: "id", type: "uuid" as const }],
			optional: [],
		}),
	};
	const noUuid = boot(widgetClientSource({ actions: { vote } }));
	assert.throws(
		() =>
			noUuid.pack("vote", { option: "pizza", note: "ok" }) &&
			boot(widgetClientSource({ actions: { fake } })).pack("fake", { id: "x" }),
		/id: uuid/,
	);
	assert.ok(!widgetClientSource({ actions: { vote } }).includes("fromCharCode"));
	assert.ok(widgetClientSource({ actions: { fake } }).includes("fromCharCode"));
});

test("describeActions caps an unbounded maxBytes to the 64-byte query limit", () => {
	const unbounded = callbackData("u", { s: String }, { maxBytes: Number.POSITIVE_INFINITY });
	assert.equal(describeActions({ unbounded }).unbounded?.maxBytes, 64);
	assert.deepEqual(describeActions(), {});
	const yw = boot(widgetClientSource({ actions: { unbounded } }));
	assert.throws(() => yw.pack("unbounded", { s: "x".repeat(70) }), /bytes > 64/);
});

test("the runtime is small, script-safe and installs under a custom global", async () => {
	const tricky = callbackData("x$&</script>", { s: String });
	const tag = widgetClient({ actions: { tricky, vote }, global: "app", wallet: true });
	assert.match(tag.value, /^<script>/);
	assert.equal(tag.value.match(/<\/script>/g)?.length, 1);
	const yw = boot(widgetClientSource({ actions: { tricky }, global: "app" }), undefined, "app");
	assert.equal(yw.pack("tricky", { s: "a" }), "x$&</script>:a");
	assert.throws(() => widgetClientSource({ global: "not valid" }), /javascript identifier/);
	// it ships inside every widget: keep the base runtime near 1.1 KB of the 4096-byte budget
	const bare = (await measureHtml(widgetClient().value)).compressedBytes;
	const full = (await measureHtml(tag.value)).compressedBytes;
	assert.ok(bare < 1200, `base runtime is ${bare} bytes compressed`);
	assert.ok(full < 1400, `runtime with actions + wallet is ${full} bytes compressed`);
});

test("outside telegram the api is inert: no state, requests reject with NOT_ALLOWED", async () => {
	const yw = boot(widgetClientSource({ actions: { vote }, wallet: true }));
	assert.equal(yw.available, false);
	assert.equal(yw.w, undefined);
	assert.equal(yw.publicData(), undefined);
	assert.equal(yw.chatData(), undefined);
	const off = yw.on("themeChanged", () => {});
	off();
	yw.watch();
	yw.unwatch();
	let calls = 0;
	yw.onState(() => calls++)();
	assert.equal(calls, 1);
	const pay = yw.pay as NonNullable<typeof yw.pay>;
	const sign = yw.sign as NonNullable<typeof yw.sign>;
	for (const p of [
		yw.ask("vote", { option: "pizza" }),
		yw.request("raw"),
		pay("vote", { option: "pizza" }),
	]) {
		await assert.rejects(p, (e: unknown) => yw.code(e) === "NOT_ALLOWED");
	}
	await assert.rejects(
		sign({ type: "text", text: "t" }, "vote", { option: "pizza" }),
		(e: unknown) => yw.code(e) === "NOT_ALLOWED",
	);
	assert.equal(boot(widgetClientSource()).pay, undefined);
	assert.equal(yw.code(new Error("x")), "FAILED");
	assert.equal(yw.code(null), "FAILED");
});

test("ask packs, sends and parses the json answer (raw text and null pass through)", async () => {
	const w = stub();
	const answers: Record<string, string | null> = {
		[V0]: '{"ok":true}',
		[V1]: "plain text",
		ping: null,
	};
	w.reply = async (data) => ({ result: answers[data] ?? null });
	const yw = boot(widgetClientSource({ actions: { vote, bare } }), w);
	assert.equal(yw.available, true);
	assert.deepEqual(plain(await yw.ask("vote", { option: "pizza" })), { ok: true });
	assert.equal(await yw.ask("vote", { option: "sushi" }), "plain text");
	assert.equal(await yw.ask("bare"), null);
	assert.equal(await yw.request("raw", { wallet: true }), null);
	assert.deepEqual(
		w.requests.map((r) => r.data),
		[V0, V1, "ping", "raw"],
	);
	assert.deepEqual(plain(w.requests[3]?.options), { wallet: true });
});

test("state decodes json, onState redraws on changes, on/watch proxy to the widget", () => {
	const w = stub();
	w.publicData = '{"yes":1}';
	w.chatData = "not json";
	const yw = boot(widgetClientSource(), w);
	assert.deepEqual(plain(yw.publicData()), { yes: 1 });
	assert.equal(yw.chatData(), undefined);

	const seen: unknown[] = [];
	const stop = yw.onState((s) => seen.push(plain(s)));
	w.publicData = '{"yes":2}';
	w.fire("publicDataChanged");
	w.chatData = '"c"';
	w.fire("chatDataChanged");
	stop();
	w.fire("publicDataChanged");
	assert.deepEqual(seen, [
		{ publicData: { yes: 1 } },
		{ publicData: { yes: 2 } },
		{ publicData: { yes: 2 }, chatData: "c" },
	]);

	let themed = 0;
	const off = yw.on("themeChanged", () => themed++);
	w.fire("themeChanged");
	off();
	w.fire("themeChanged");
	assert.equal(themed, 1);

	yw.watch();
	yw.watch();
	yw.unwatch();
	assert.equal(w.watching, 1);
});

test("with revisions on, state is unwrapped and stale polls are dropped", () => {
	const votes = widgetState<{ yes: number }>({ revision: true });
	const w = stub();
	const first = votes.encode({ yes: 1 });
	const second = votes.encode({ yes: 2 });
	w.publicData = second;
	const yw = boot(widgetClientSource({ revision: true }), w);
	assert.deepEqual(plain(yw.publicData()), { yes: 2 });

	const seen: unknown[] = [];
	yw.onState((s) => seen.push(plain(s.publicData)));
	w.publicData = first; // an older poll arrives late
	w.fire("publicDataChanged");
	w.publicData = votes.encode({ yes: 3 });
	w.fire("publicDataChanged");
	w.publicData = '{"yes":4}'; // not an envelope → no revision → treated as oldest, dropped
	w.fire("publicDataChanged");
	assert.deepEqual(seen, [{ yes: 2 }, { yes: 3 }]);
	w.publicData = '{"yes":4}';
	assert.equal(yw.publicData(), undefined);
});

test("a stale public poll doesn't swallow a fresh chat_data change, and repeats are deduped", () => {
	const shared = widgetState<{ n: number }>({ revision: true });
	const mine = widgetState<{ me: string }>({ revision: true, field: "chat_data" });
	const w = stub();
	const older = shared.encode({ n: 1 });
	w.publicData = shared.encode({ n: 2 });
	w.chatData = mine.encode({ me: "a" });
	const yw = boot(widgetClientSource({ revision: true }), w);

	const seen: unknown[] = [];
	yw.onState((s) => seen.push(plain(s)));
	w.publicData = older; // stale poll…
	w.chatData = mine.encode({ me: "b" }); // …arriving with a real chat change
	w.fire("chatDataChanged");
	w.fire("publicDataChanged"); // nothing new by now
	assert.deepEqual(seen, [
		{ publicData: { n: 2 }, chatData: { me: "a" } },
		{ publicData: { n: 2 }, chatData: { me: "b" } },
	]);
});

test("pay asks with the wallet flag, then sends the answered transaction under the same label", async () => {
	const w = stub();
	const sent: unknown[] = [];
	w.wallet = {
		sendTransaction: async (tx: unknown, data: string) => {
			sent.push({ tx, data });
			return { result: '{"paid":true}' };
		},
		signData: async (payload: unknown, data: string) => {
			sent.push({ payload, data });
			return { result: null };
		},
	};
	const tx = { valid_until: 1, messages: [{ address: "EQ", amount: "1" }] };
	w.reply = async () => ({ result: JSON.stringify(tx) });
	const yw = boot(widgetClientSource({ actions: { vote }, wallet: true }), w);
	const pay = yw.pay as NonNullable<typeof yw.pay>;
	const sign = yw.sign as NonNullable<typeof yw.sign>;

	assert.deepEqual(plain(await pay("vote", { option: "pizza" })), { paid: true });
	assert.deepEqual(plain(w.requests), [{ data: V0, options: { wallet: true } }]);
	assert.equal(await sign({ type: "text", text: "hi" }, "vote", { option: "sushi" }), null);
	assert.deepEqual(plain(sent), [
		{ tx, data: V0 },
		{ payload: { type: "text", text: "hi" }, data: V1 },
	]);

	w.wallet = null;
	await assert.rejects(pay("vote", { option: "pizza" }), /no wallet/);
	await assert.rejects(sign({ type: "text", text: "x" }, "vote", { option: "pizza" }), /no wallet/);
});

test("request errors from the widget keep their code", async () => {
	const w = stub();
	w.reply = () =>
		Promise.reject(Object.assign(new Error("busy"), { name: "WidgetRequestError", code: "BUSY" }));
	const yw = boot(widgetClientSource({ actions: { vote } }), w);
	await assert.rejects(yw.ask("vote", { option: "pizza" }), (e: unknown) => yw.code(e) === "BUSY");
});
