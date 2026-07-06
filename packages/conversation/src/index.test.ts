import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { type ConversationControl, conversation, createConversation } from "./index.js";

const noop = async () => {};
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

function fakeApi() {
	const sent: string[] = [];
	const api = {
		call(method: string, p: Record<string, unknown>) {
			if (method === "sendMessage") sent.push(String(p.text));
			return Promise.resolve({ message_id: 1 });
		},
	} as never;
	return { api, sent };
}

const msgCtx = (api: never, text: string, chatId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});

type Ctx = Context & { conversation: ConversationControl };

test("conversation walks through steps and consumes the chat's updates", async () => {
	const { api, sent } = fakeApi();
	let fellThrough = 0;

	const greet = createConversation("greet", async (cv, ctx) => {
		await ctx.send("name?");
		const a = await cv.wait();
		await a.send("age?");
		const b = await cv.wait();
		await b.send(`${a.text} is ${b.text}`);
	});

	const mw = entry(
		new Composer<Context>()
			.install(conversation([greet]))
			.command("greet", (ctx) => (ctx as Ctx).conversation.enter("greet"))
			.on("message:text", () => {
				fellThrough++;
			}),
	);

	await mw(msgCtx(api, "/greet", 1), noop);
	await flush();
	await mw(msgCtx(api, "Bob", 1), noop);
	await flush();
	await mw(msgCtx(api, "30", 1), noop);
	await flush();

	assert.deepEqual(sent, ["name?", "age?", "Bob is 30"]);
	assert.equal(fellThrough, 0); // every step was consumed by the conversation
});

test("a different chat is not captured by another chat's conversation", async () => {
	const { api } = fakeApi();
	let seen = "";

	const wait1 = createConversation("wait", async (cv) => {
		await cv.wait();
	});

	const mw = entry(
		new Composer<Context>()
			.install(conversation([wait1]))
			.command("go", (ctx) => (ctx as Ctx).conversation.enter("wait"))
			.on("message:text", (ctx) => {
				seen = ctx.text;
			}),
	);

	await mw(msgCtx(api, "/go", 1), noop); // chat 1 enters a conversation
	await flush();
	await mw(msgCtx(api, "hello", 2), noop); // chat 2 is independent
	assert.equal(seen, "hello");
});

test("active() reflects conversation state, leave() ends it", async () => {
	const { api } = fakeApi();
	const states: boolean[] = [];

	const wait1 = createConversation("wait", async (cv) => {
		await cv.wait();
		await cv.wait(); // would need a third update, but we leave() before then
	});

	const mw = entry(
		new Composer<Context>()
			.install(conversation([wait1]))
			.command("go", (ctx) => (ctx as Ctx).conversation.enter("wait"))
			.on("message:text", (ctx) => {
				states.push((ctx as Ctx).conversation.active());
			}),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	await flush();
	// chat 1 now has an active conversation: the next text is consumed (no fall-through)
	await mw(msgCtx(api, "x", 1), noop);
	await flush();

	const probe = msgCtx(api, "probe", 3);
	await mw(probe, noop);
	assert.equal(states.includes(true), false); // chat 3 never had one
	assert.equal((probe as Ctx).conversation.active(), false);
});
