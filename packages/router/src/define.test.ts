import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import {
	createRouter,
	defineCommand,
	defineGuard,
	defineHears,
	defineOn,
	defineUse,
} from "./define.js";
import { ROUTE_DEF } from "./types.js";

test("defineCommand: bare handler, no meta", () => {
	const handler = () => {};
	const def = defineCommand("start", handler);

	assert.equal(def[ROUTE_DEF], true);
	assert.deepEqual(def, {
		[ROUTE_DEF]: true,
		kind: "command",
		names: ["start"],
		meta: {},
		handlers: [handler],
	});
});

test("defineCommand: aliases via [name, ...aliases]", () => {
	const def = defineCommand(["start", "s", "go"], () => {});
	assert.equal(def.kind, "command");
	if (def.kind !== "command") throw new Error("unreachable");
	assert.deepEqual(def.names, ["start", "s", "go"]);
});

test("defineCommand: meta as second argument, handlers after", () => {
	const handler = () => {};
	const def = defineCommand("start", { description: "start the bot" }, handler);

	assert.equal(def.kind, "command");
	if (def.kind !== "command") throw new Error("unreachable");
	assert.deepEqual(def.meta, { description: "start the bot" });
	assert.deepEqual(def.handlers, [handler]);
});

test("defineCommand: meta with zero handlers is a menu-only entry", () => {
	const def = defineCommand("about", { description: "about this bot" });
	assert.equal(def.kind, "command");
	if (def.kind !== "command") throw new Error("unreachable");
	assert.deepEqual(def.handlers, []);
});

test("defineCommand: empty name array throws", () => {
	assert.throws(() => defineCommand([] as unknown as string, () => {}), TypeError);
});

test("defineOn: query and handlers preserved", () => {
	const handler = () => {};
	const def = defineOn("message:text", handler);

	assert.equal(def.kind, "on");
	if (def.kind !== "on") throw new Error("unreachable");
	assert.equal(def.query, "message:text");
	assert.deepEqual(def.handlers, [handler]);
});

test("defineHears: string and regex triggers", () => {
	const strDef = defineHears("ping", () => {});
	const reDef = defineHears(/^ping$/i, () => {});

	assert.equal(strDef.kind, "hears");
	assert.equal(reDef.kind, "hears");
	if (strDef.kind !== "hears" || reDef.kind !== "hears") throw new Error("unreachable");
	assert.equal(strDef.trigger, "ping");
	assert.ok(reDef.trigger instanceof RegExp);
});

test("defineUse: collapses a Composer via toMiddleware()", async () => {
	const hits: string[] = [];
	const composer = new Composer<Context>().use((_ctx, next) => {
		hits.push("mounted");
		return next();
	});

	const def = defineUse(composer);
	assert.equal(def.kind, "use");
	if (def.kind !== "use") throw new Error("unreachable");
	assert.equal(def.handlers.length, 1);

	await def.handlers[0]?.({} as Context, async () => {});
	assert.deepEqual(hits, ["mounted"]);
});

test("defineUse: passes bare middleware through untouched", () => {
	const mw = (_ctx: Context, next: () => Promise<void>) => next();
	const def = defineUse(mw);

	assert.equal(def.kind, "use");
	if (def.kind !== "use") throw new Error("unreachable");
	assert.equal(def.handlers[0], mw);
});

test("defineGuard: wraps the predicate as-is", () => {
	const predicate = (ctx: Context & { isAdmin?: boolean }) => ctx.isAdmin === true;
	const def = defineGuard(predicate);

	assert.equal(def.kind, "guard");
	assert.equal(def.predicate, predicate);
});

test("createRouter: bound helpers produce the same shape as the top-level ones", () => {
	type Ctx = Context & { greeting: string };
	const { defineCommand: boundCommand, defineOn: boundOn } = createRouter<Ctx>();

	const cmd = boundCommand("hi", (ctx) => {
		// context narrowing check — `ctx.greeting` and `ctx.args` must both be visible here
		void (ctx.greeting satisfies string);
		void (ctx.args satisfies string[]);
	});
	const on = boundOn("message:text", (ctx) => {
		void (ctx.text satisfies string);
	});

	assert.equal(cmd.kind, "command");
	assert.equal(on.kind, "on");
});
