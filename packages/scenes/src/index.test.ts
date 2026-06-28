import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { type SceneContext, type SceneDef, scenes } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;
const msgCtx = (text: string, chatId: number) =>
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

test("a wizard collects input across messages and leaves", async () => {
	const collected: Record<string, string> = {};
	const asked: string[] = [];
	const defs: Record<string, SceneDef> = {
		reg: {
			enter: (ctx) => {
				asked.push("name?");
			},
			steps: [
				(ctx: SceneContext) => {
					collected.name = ctx.text ?? "";
					ctx.scene.next();

					asked.push("age?");
				},
				(ctx: SceneContext) => {
					collected.age = ctx.text ?? "";

					return ctx.scene.leave();
				},
			],
		},
	};

	const storage = new MemoryStorage<{ scene: string; step: number }>();
	let fellThrough = 0;

	const mw = entry(
		new Composer<Context>()
			.install(scenes(defs, { storage }))
			.command("reg", (ctx) => ctx.scene.enter("reg"))
			.on("message:text", () => {
				fellThrough++;
			}),
	);

	await mw(msgCtx("/reg", 1), noop); // enter → asks name
	assert.deepEqual(asked, ["name?"]);
	assert.deepEqual((await storage.get("1")) ?? null, { scene: "reg", step: 0 });

	await mw(msgCtx("Alice", 1), noop); // step 0 → name, advance, asks age
	assert.equal(collected.name, "Alice");
	assert.deepEqual((await storage.get("1")) ?? null, { scene: "reg", step: 1 });

	await mw(msgCtx("30", 1), noop); // step 1 → age, leave
	assert.equal(collected.age, "30");
	assert.equal(await storage.get("1"), undefined); // scene cleared

	// scene messages were consumed — the fallthrough handler never saw them
	assert.equal(fellThrough, 0);
});

test("messages outside a scene fall through to normal handlers", async () => {
	let seen = "";

	const mw = entry(
		new Composer<Context>().install(scenes({ reg: { steps: [] } })).on("message:text", (ctx) => {
			seen = ctx.text;
		}),
	);

	await mw(msgCtx("hello", 2), noop);
	assert.equal(seen, "hello");
});

test("a step can switch scenes via enter()", async () => {
	const defs: Record<string, SceneDef> = {
		a: { steps: [(ctx: SceneContext) => ctx.scene.enter("b")] },
		b: { steps: [(ctx: SceneContext) => ctx.scene.leave()] },
	};

	const storage = new MemoryStorage<{ scene: string; step: number }>();
	const mw = entry(
		new Composer<Context>()
			.install(scenes(defs, { storage }))
			.command("a", (ctx) => ctx.scene.enter("a")),
	);

	await mw(msgCtx("/a", 5), noop); // in scene a
	await mw(msgCtx("go", 5), noop); // step a[0] → enter("b")
	assert.deepEqual((await storage.get("5")) ?? null, { scene: "b", step: 0 });

	await mw(msgCtx("done", 5), noop); // step b[0] → leave
	assert.equal(await storage.get("5"), undefined);
});

test("a step that does not advance re-runs (validation)", async () => {
	let attempts = 0;
	const defs: Record<string, SceneDef> = {
		ask: {
			steps: [
				(ctx: SceneContext) => {
					attempts++;
					if (ctx.text === "ok") return ctx.scene.leave();
					// invalid → stay on the same step
				},
			],
		},
	};

	const storage = new MemoryStorage<{ scene: string; step: number }>();
	const mw = entry(
		new Composer<Context>()
			.install(scenes(defs, { storage }))
			.command("ask", (ctx) => ctx.scene.enter("ask")),
	);

	await mw(msgCtx("/ask", 3), noop);
	await mw(msgCtx("nope", 3), noop); // stays
	assert.deepEqual((await storage.get("3")) ?? null, { scene: "ask", step: 0 });
	
	await mw(msgCtx("ok", 3), noop); // leaves
	assert.equal(await storage.get("3"), undefined);
	assert.equal(attempts, 2);
});
