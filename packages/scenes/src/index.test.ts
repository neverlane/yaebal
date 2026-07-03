import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { createTestEnv } from "@yaebal/test";
import { type SceneContext, type SceneDef, scenes } from "./index.js";

test("a wizard collects input across messages and leaves", async () => {
	const collected: Record<string, string> = {};
	const asked: string[] = [];
	const defs: Record<string, SceneDef> = {
		reg: {
			enter: (_ctx) => {
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

	const bot = new Composer<Context>()
		.install(scenes(defs, { storage }))
		.command("reg", (ctx) => ctx.scene.enter("reg"))
		.on("message:text", () => {
			fellThrough++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = String(user.pmChat.id);

	await user.sendCommand("reg"); // enter → asks name
	assert.deepEqual(asked, ["name?"]);
	assert.deepEqual((await storage.get(key)) ?? null, { scene: "reg", step: 0 });

	await user.sendMessage("Linia"); // step 0 → name, advance, asks age
	assert.equal(collected.name, "Linia");
	assert.deepEqual((await storage.get(key)) ?? null, { scene: "reg", step: 1 });

	await user.sendMessage("30"); // step 1 → age, leave
	assert.equal(collected.age, "30");
	assert.equal(await storage.get(key), undefined); // scene cleared

	// scene messages were consumed — the fallthrough handler never saw them
	assert.equal(fellThrough, 0);
});

test("messages outside a scene fall through to normal handlers", async () => {
	let seen = "";

	const bot = new Composer<Context>()
		.install(scenes({ reg: { steps: [] } }))
		.on("message:text", (ctx) => {
			seen = ctx.text ?? "";
		});

	const env = createTestEnv(bot);
	await env.createUser().sendMessage("hello");
	assert.equal(seen, "hello");
});

test("a step can switch scenes via enter()", async () => {
	const defs: Record<string, SceneDef> = {
		a: { steps: [(ctx: SceneContext) => ctx.scene.enter("b")] },
		b: { steps: [(ctx: SceneContext) => ctx.scene.leave()] },
	};

	const storage = new MemoryStorage<{ scene: string; step: number }>();
	const bot = new Composer<Context>()
		.install(scenes(defs, { storage }))
		.command("a", (ctx) => ctx.scene.enter("a"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = String(user.pmChat.id);

	await user.sendCommand("a"); // in scene a
	await user.sendMessage("go"); // step a[0] → enter("b")
	assert.deepEqual((await storage.get(key)) ?? null, { scene: "b", step: 0 });

	await user.sendMessage("done"); // step b[0] → leave
	assert.equal(await storage.get(key), undefined);
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
	const bot = new Composer<Context>()
		.install(scenes(defs, { storage }))
		.command("ask", (ctx) => ctx.scene.enter("ask"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = String(user.pmChat.id);

	await user.sendCommand("ask");
	await user.sendMessage("nope"); // stays
	assert.deepEqual((await storage.get(key)) ?? null, { scene: "ask", step: 0 });

	await user.sendMessage("ok"); // leaves
	assert.equal(await storage.get(key), undefined);
	assert.equal(attempts, 2);
});
