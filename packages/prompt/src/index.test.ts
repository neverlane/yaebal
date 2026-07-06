import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { type PromptControl, prompt } from "./index.js";

const noop = async () => {};
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

type Ctx = Context & PromptControl;

test("prompt runs its handler on the next message and consumes it", async () => {
	const { api } = fakeApi();

	let answer = "";
	let fellThrough = 0;

	const mw = entry(
		new Composer<Context>()
			.install(prompt())
			.command("ask", (ctx) =>
				(ctx as Ctx).prompt("name?", (c) => {
					answer = c.text ?? "";
				}),
			)
			.on("message:text", () => {
				fellThrough++;
			}),
	);

	await mw(msgCtx(api, "/ask", 1), noop); // asks
	await mw(msgCtx(api, "Bob", 1), noop); // answers

	assert.equal(answer, "Bob");
	assert.equal(fellThrough, 0); // the answer was consumed
});

test("prompts chain", async () => {
	const { api, sent } = fakeApi();

	const got: string[] = [];
	const mw = entry(
		new Composer<Context>().install(prompt()).command("ask", (ctx) =>
			(ctx as Ctx).prompt("first?", (c1) => {
				got.push(c1.text ?? "");

				return (c1 as Ctx).prompt("second?", (c2) => {
					got.push(c2.text ?? "");
				});
			}),
		),
	);

	await mw(msgCtx(api, "/ask", 1), noop);
	await mw(msgCtx(api, "a", 1), noop);
	await mw(msgCtx(api, "b", 1), noop);

	assert.deepEqual(got, ["a", "b"]);
	assert.deepEqual(sent, ["first?", "second?"]);
});

test("an unrelated message with no pending prompt falls through", async () => {
	const { api } = fakeApi();

	let seen = "";

	const mw = entry(
		new Composer<Context>().install(prompt()).on("message:text", (ctx) => {
			seen = ctx.text;
		}),
	);
	await mw(msgCtx(api, "hello", 2), noop);

	assert.equal(seen, "hello");
});
