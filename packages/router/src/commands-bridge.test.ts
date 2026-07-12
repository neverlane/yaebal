import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@yaebal/core";
import type { BotCommand, BotCommandScope } from "@yaebal/types";
import { applyCommandsBridge } from "./commands-bridge.js";
import { defineCommand } from "./define.js";
import type {
	CommandApiLike,
	CommandDescription,
	CommandRouteDef,
	CommandsRegistryLike,
} from "./types.js";

function asCommandDef(def: ReturnType<typeof defineCommand>): CommandRouteDef<Context> {
	if (def.kind !== "command") throw new Error("expected a command route def");
	return def;
}

function fakeApi(initial: BotCommand[] = []) {
	let current = initial;
	const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];

	const api: CommandApiLike = {
		async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
			calls.push({ method, params });
			if (method === "getMyCommands") return current as unknown as T;
			if (method === "setMyCommands") {
				current = (params?.commands as BotCommand[]) ?? [];
				return true as unknown as T;
			}
			throw new Error(`fakeApi: unexpected method ${method}`);
		},
	};

	return { api, calls, current: () => current };
}

test("applyCommandsBridge: bare mode returns default-scope, menu-visible commands only", async () => {
	const defs = [
		asCommandDef(defineCommand("start", { description: "start the bot" }, () => {})),
		asCommandDef(defineCommand("debug", { description: "debug", hidden: true }, () => {})),
		asCommandDef(defineCommand("silent", () => {})), // no description — handled, not menu-visible
		asCommandDef(
			defineCommand(
				"ban",
				{ description: "ban a user", scope: { type: "all_chat_administrators" } },
				() => {},
			),
		),
	];

	const { commands } = await applyCommandsBridge(defs, {});

	assert.deepEqual(commands, [{ command: "start", description: "start the bot" }]);
});

test("applyCommandsBridge: options.commands is fed name/description/scope with zero handlers", async () => {
	const calls: Array<{
		name: string | string[];
		description: CommandDescription;
		scope?: BotCommandScope;
	}> = [];

	const registry: CommandsRegistryLike<Context> = {
		add: (name, description) => {
			calls.push({ name, description });
			return registry;
		},
		scoped: (scope) => ({
			add: (name, description) => {
				calls.push({ name, description, scope });
				return registry;
			},
		}),
	};

	const defs = [
		asCommandDef(defineCommand(["start", "s"], { description: "start" }, () => {})),
		asCommandDef(defineCommand("hidden", { description: "nope", hidden: true }, () => {})),
		asCommandDef(defineCommand("bare", () => {})),
	];

	await applyCommandsBridge(defs, { commands: registry });

	assert.deepEqual(calls, [{ name: ["start", "s"], description: "start" }]);
});

test("applyCommandsBridge: syncCommands diffs against getMyCommands and pushes only on change", async () => {
	const { api, calls } = fakeApi([]);
	const defs = [asCommandDef(defineCommand("start", { description: "start the bot" }, () => {}))];

	await applyCommandsBridge(defs, { syncCommands: { api } });

	const pushed = calls.filter((c) => c.method === "setMyCommands");
	assert.equal(pushed.length, 1);
	assert.deepEqual(pushed[0]?.params?.commands, [
		{ command: "start", description: "start the bot" },
	]);
});

test("applyCommandsBridge: syncCommands is a no-op when telegram already matches", async () => {
	const { api, calls } = fakeApi([{ command: "start", description: "start the bot" }]);
	const defs = [asCommandDef(defineCommand("start", { description: "start the bot" }, () => {}))];

	await applyCommandsBridge(defs, { syncCommands: { api } });

	assert.equal(calls.filter((c) => c.method === "setMyCommands").length, 0);
});

test("applyCommandsBridge: syncCommands falls back to the target's own .api", async () => {
	const { api, calls } = fakeApi([]);
	const defs = [asCommandDef(defineCommand("start", { description: "start the bot" }, () => {}))];

	await applyCommandsBridge(defs, { syncCommands: true }, api);

	assert.equal(calls.filter((c) => c.method === "setMyCommands").length, 1);
});

test("applyCommandsBridge: syncCommands with no api anywhere throws", async () => {
	const defs = [asCommandDef(defineCommand("start", { description: "start the bot" }, () => {}))];
	await assert.rejects(
		() => applyCommandsBridge(defs, { syncCommands: true }),
		/needs an api client/,
	);
});
