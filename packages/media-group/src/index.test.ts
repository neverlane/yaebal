import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Message, type Middleware } from "@yaebal/core";
import { mediaGroup } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;
const albumCtx = (groupId: string | undefined, text: string) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" },
				from: { id: 1, is_bot: false, first_name: "u" },
				media_group_id: groupId,
				text,
			},
		} as never,
		updateType: "message",
	});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("album parts are collected into one handler call", async () => {
	const captured: Message[][] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(_ctx, messages) => {
					captured.push(messages);
				},
				{ delayMs: 5 },
			),
		),
	);

	await mw(albumCtx("g1", "a"), noop);
	await mw(albumCtx("g1", "b"), noop);
	await mw(albumCtx("g1", "c"), noop);
	await wait(25); // past the debounce

	assert.equal(captured.length, 1); // one album, one call
	assert.deepEqual(
		captured[0]?.map((m) => m.text),
		["a", "b", "c"],
	);
});

test("messages without a media_group_id pass through", async () => {
	let through = false;
	const mw = entry(
		new Composer<Context>().install(mediaGroup(() => {}, { delayMs: 5 })).on("message:text", () => {
			through = true;
		}),
	);

	await mw(albumCtx(undefined, "plain"), noop);

	assert.equal(through, true);
});

test("separate albums fire independently", async () => {
	const sizes: number[] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(_ctx, messages) => {
					sizes.push(messages.length);
				},
				{ delayMs: 5 },
			),
		),
	);

	await mw(albumCtx("a", "1"), noop);
	await mw(albumCtx("b", "1"), noop);
	await mw(albumCtx("b", "2"), noop);
	
	await wait(25);
	assert.deepEqual(sizes.sort(), [1, 2]);
});
