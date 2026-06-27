import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { commands } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;
const cmdCtx = (text: string) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" },
				from: { id: 1, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});

test("list() yields the {command, description} menu", () => {
	const cmd = commands()
		.add("start", "start the bot", () => {})
		.add("help", "show help", () => {});
	assert.deepEqual(cmd.list(), [
		{ command: "start", description: "start the bot" },
		{ command: "help", description: "show help" },
	]);
});

test("plugin() registers the handlers", async () => {
	let started = false;
	const cmd = commands().add("start", "start", () => {
		started = true;
	});
	const mw = entry(new Composer<Context>().install(cmd.plugin()));
	await mw(cmdCtx("/start"), noop);
	assert.equal(started, true);
});

test("register() pushes the list via setMyCommands", async () => {
	const calls: Array<{ method: string; params: unknown }> = [];
	const fakeApi = {
		call: (method: string, params: unknown) => {
			calls.push({ method, params });
			return Promise.resolve(true);
		},
	};
	const cmd = commands().add("start", "go", () => {});
	await cmd.register(fakeApi as never, { languageCode: "en" });
	assert.deepEqual(calls, [
		{
			method: "setMyCommands",
			params: { commands: [{ command: "start", description: "go" }], language_code: "en" },
		},
	]);
});
