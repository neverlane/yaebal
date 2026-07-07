import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Message, type Middleware } from "@yaebal/core";
import { mediaGroup } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;

interface AlbumCtxOptions {
	groupId?: string;
	text?: string;
	chatId?: number;
	messageId?: number;
	kind?: "message" | "edited_message" | "channel_post";
}

const albumCtx = (options: AlbumCtxOptions = {}) => {
	const kind = options.kind ?? "message";
	return new Context({
		api,
		update: {
			update_id: 1,
			[kind]: {
				message_id: options.messageId ?? 1,
				date: 0,
				chat: { id: options.chatId ?? 1, type: "private" },
				from: { id: 1, is_bot: false, first_name: "u" },
				media_group_id: options.groupId,
				text: options.text,
			},
		} as never,
		updateType: kind,
	});
};

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

	await mw(albumCtx({ groupId: "g1", text: "a", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", text: "b", messageId: 2 }), noop);
	await mw(albumCtx({ groupId: "g1", text: "c", messageId: 3 }), noop);
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

	await mw(albumCtx({ text: "plain" }), noop);

	assert.equal(through, true);
});

test("album parts are consumed — they never reach downstream handlers", async () => {
	let downstream = 0;
	const mw = entry(
		new Composer<Context>().install(mediaGroup(() => {}, { delayMs: 5 })).on("message", () => {
			downstream++;
		}),
	);

	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 2 }), noop);
	await wait(25);

	assert.equal(downstream, 0);
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

	await mw(albumCtx({ groupId: "a", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "b", messageId: 2 }), noop);
	await mw(albumCtx({ groupId: "b", messageId: 3 }), noop);

	await wait(25);
	assert.deepEqual(sizes.sort(), [1, 2]);
});

test("the same media_group_id in different chats stays separate", async () => {
	const chats: (number | undefined)[] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(ctx, messages) => {
					chats.push(ctx.chat?.id);
					assert.equal(messages.length, 1);
				},
				{ delayMs: 5 },
			),
		),
	);

	// e.g. a channel album auto-forwarded into the linked discussion group
	// keeps the channel's media_group_id.
	await mw(albumCtx({ groupId: "shared", chatId: 100, messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "shared", chatId: 200, messageId: 1 }), noop);
	await wait(25);

	assert.deepEqual(chats.sort(), [100, 200]);
});

test("edited messages pass through by default instead of being collected", async () => {
	let collected = 0;
	let downstream = 0;
	const mw = entry(
		new Composer<Context>()
			.install(
				mediaGroup(
					() => {
						collected++;
					},
					{ delayMs: 5 },
				),
			)
			.on("edited_message", () => {
				downstream++;
			}),
	);

	await mw(albumCtx({ groupId: "g1", kind: "edited_message" }), noop);
	await wait(25);

	assert.equal(collected, 0);
	assert.equal(downstream, 1);
});

test("opted-in update kinds collect into their own groups", async () => {
	const kinds: string[] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(ctx, messages) => {
					kinds.push(`${ctx.updateType}:${messages.length}`);
				},
				{ delayMs: 5, updates: ["message", "edited_message"] },
			),
		),
	);

	// same chat, same media_group_id — a new part and an edit must not merge.
	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 1, kind: "edited_message" }), noop);
	await wait(25);

	assert.deepEqual(kinds.sort(), ["edited_message:1", "message:1"]);
});

test("channel post albums are collected", async () => {
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

	await mw(albumCtx({ groupId: "c1", kind: "channel_post", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "c1", kind: "channel_post", messageId: 2 }), noop);
	await wait(25);

	assert.deepEqual(sizes, [2]);
});

test("messages flush sorted by message_id even when parts arrive out of order", async () => {
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

	await mw(albumCtx({ groupId: "g1", messageId: 3 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 2 }), noop);
	await wait(25);

	assert.deepEqual(
		captured[0]?.map((m) => m.message_id),
		[1, 2, 3],
	);
});

test("redelivered parts are deduplicated by message_id", async () => {
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

	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop); // webhook retry
	await mw(albumCtx({ groupId: "g1", messageId: 2 }), noop);
	await wait(25);

	assert.deepEqual(
		captured[0]?.map((m) => m.message_id),
		[1, 2],
	);
});

test("a full album of 10 parts flushes immediately, without the debounce", async () => {
	const captured: Message[][] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(_ctx, messages) => {
					captured.push(messages);
				},
				{ delayMs: 10_000 }, // would time the test out if the short-circuit failed
			),
		),
	);

	for (let i = 1; i <= 10; i++) {
		await mw(albumCtx({ groupId: "g1", messageId: i }), noop);
	}

	assert.equal(captured.length, 1);
	assert.equal(captured[0]?.length, 10);
});

test("a late part extends the debounce window", async () => {
	const captured: Message[][] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				(_ctx, messages) => {
					captured.push(messages);
				},
				{ delayMs: 120 },
			),
		),
	);

	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await wait(60);
	await mw(albumCtx({ groupId: "g1", messageId: 2 }), noop);
	await wait(60); // 120ms past the first part — a non-extending timer would have fired
	await mw(albumCtx({ groupId: "g1", messageId: 3 }), noop);
	await wait(200);

	assert.equal(captured.length, 1);
	assert.equal(captured[0]?.length, 3);
});

test("a handler error goes to onError and later albums keep working", async () => {
	const errors: unknown[] = [];
	const sizes: number[] = [];
	const mw = entry(
		new Composer<Context>().install(
			mediaGroup(
				async (_ctx, messages) => {
					if (messages[0]?.text === "boom") throw new Error("album failed");
					sizes.push(messages.length);
				},
				{
					delayMs: 5,
					onError: (error) => {
						errors.push(error);
					},
				},
			),
		),
	);

	await mw(albumCtx({ groupId: "bad", text: "boom", messageId: 1 }), noop);
	await wait(25);
	await mw(albumCtx({ groupId: "good", text: "fine", messageId: 2 }), noop);
	await wait(25);

	assert.equal(errors.length, 1);
	assert.match(String(errors[0]), /album failed/);
	assert.deepEqual(sizes, [1]);
});

test("flush() delivers pending albums right away", async () => {
	const captured: Message[][] = [];
	const plugin = mediaGroup<Context>(
		(_ctx, messages) => {
			captured.push(messages);
		},
		{ delayMs: 10_000 },
	);
	const mw = entry(new Composer<Context>().install(plugin));

	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", messageId: 2 }), noop);

	assert.equal(captured.length, 0);
	await plugin.flush();
	assert.equal(captured.length, 1);
	assert.equal(captured[0]?.length, 2);

	await plugin.flush(); // nothing pending — must be a no-op
	assert.equal(captured.length, 1);
});

test("pass-through mode: the first part continues down the chain with ctx.mediaGroup", async () => {
	const seen: { text: string | undefined; album: number | undefined }[] = [];
	const mw = entry(
		new Composer<Context>().install(mediaGroup({ delayMs: 5 })).on("message", (ctx) => {
			seen.push({ text: ctx.text, album: ctx.mediaGroup?.length });
		}),
	);

	await mw(albumCtx({ groupId: "g1", text: "first", messageId: 1 }), noop);
	await mw(albumCtx({ groupId: "g1", text: "second", messageId: 2 }), noop);
	await mw(albumCtx({ text: "plain", messageId: 3 }), noop);
	await wait(25);

	// the plain message went straight through; the album arrived once, as its
	// first message, with the full group attached.
	assert.deepEqual(seen, [
		{ text: "plain", album: undefined },
		{ text: "first", album: 2 },
	]);
});

test("pass-through mode: downstream errors go to onError", async () => {
	const errors: unknown[] = [];
	const mw = entry(
		new Composer<Context>()
			.install(
				mediaGroup({
					delayMs: 5,
					onError: (error) => {
						errors.push(error);
					},
				}),
			)
			.on("message", (ctx) => {
				if (ctx.mediaGroup) throw new Error("downstream failed");
			}),
	);

	await mw(albumCtx({ groupId: "g1", messageId: 1 }), noop);
	await wait(25);

	assert.equal(errors.length, 1);
	assert.match(String(errors[0]), /downstream failed/);
});
