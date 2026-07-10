import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import { createTestEnv, editedMessageUpdate } from "@yaebal/test";
import { ask, defineScene, type LeaveInfo, type SceneSnapshot, scenes } from "./index.js";

const sentTexts = (env: { callsTo(method: string): { params?: unknown }[] }): string[] =>
	env.callsTo("sendMessage").map((call) => (call.params as { text: string }).text);

test("a wizard asks, collects typed state and finishes", async () => {
	const storage = new MemoryStorage<SceneSnapshot>();
	const reg = defineScene<Context, { name: string; age: number }>({
		steps: [
			ask("name", { question: "name?" }),
			ask("age", {
				question: "age?",
				parse: (text) => (/^\d+$/.test(text) ? Number(text) : undefined),
				invalid: "digits only",
			}),
		],
		onLeave: (ctx, info) =>
			info.reason === "finish" && ctx.send(`saved ${ctx.scene.state.name}, ${ctx.scene.state.age}`),
	});

	const bot = new Composer<Context>()
		.install(scenes({ reg }, { storage }))
		.command("reg", (ctx) => ctx.scene.enter("reg"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await user.sendCommand("reg"); // enter → step 0 asks
	assert.deepEqual(sentTexts(env), ["name?"]);
	assert.equal((await storage.get(key))?.scene, "reg");
	assert.equal((await storage.get(key))?.firstTime, false);

	await user.sendMessage("Linia"); // step 0 collects, step 1 asks
	assert.deepEqual(sentTexts(env), ["name?", "age?"]);
	assert.deepEqual((await storage.get(key))?.data, { name: "Linia" });

	await user.sendMessage("oldish"); // invalid → stays on step 1
	assert.deepEqual(sentTexts(env), ["name?", "age?", "digits only"]);
	assert.equal((await storage.get(key))?.step, 1);

	await user.sendMessage("30"); // valid → past last step → finish
	assert.deepEqual(sentTexts(env), ["name?", "age?", "digits only", "saved Linia, 30"]);
	assert.equal(await storage.get(key), undefined);
});

test("a plain fn step runs a question pass, then processing passes", async () => {
	const passes: boolean[] = [];
	const echo = defineScene({
		steps: [
			async (ctx) => {
				passes.push(ctx.scene.firstTime);
				if (ctx.scene.firstTime) return ctx.send("say something");
				await ctx.send(`you said: ${ctx.text}`);
				return ctx.scene.leave({ silent: true });
			},
		],
	});

	const bot = new Composer<Context>()
		.install(scenes({ echo }))
		.command("echo", (ctx) => ctx.scene.enter("echo"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("echo");
	await user.sendMessage("hello");
	assert.deepEqual(passes, [true, false]);
	assert.deepEqual(sentTexts(env), ["say something", "you said: hello"]);
});

test("messages outside a scene fall through to normal handlers", async () => {
	let seen = "";
	const bot = new Composer<Context>()
		.install(scenes({ noop: { steps: [() => {}] } }))
		.on("message:text", (ctx) => {
			seen = ctx.text ?? "";
		});

	const env = createTestEnv(bot);
	await env.createUser().sendMessage("hello");
	assert.equal(seen, "hello");
});

test("scene messages are consumed — handlers below never see them", async () => {
	let fellThrough = 0;
	const bot = new Composer<Context>()
		.install(
			scenes({
				hungry: { steps: [(ctx) => (ctx.scene.firstTime ? undefined : ctx.scene.next())] },
			}),
		)
		.command("go", (ctx) => ctx.scene.enter("hungry"))
		.on("message:text", () => {
			fellThrough++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await user.sendMessage("answer");
	assert.equal(fellThrough, 0);
});

test("commands bypass an active scene by default — a global /cancel works", async () => {
	const leaves: LeaveInfo[] = [];
	const storage = new MemoryStorage<SceneSnapshot>();
	const quest = defineScene({
		steps: [ask("name", { question: "name?" })],
		onLeave: (_ctx, info) => {
			leaves.push(info);
		},
	});

	const bot = new Composer<Context>()
		.install(scenes({ quest }, { storage }))
		.command("quest", (ctx) => ctx.scene.enter("quest"))
		.command("cancel", async (ctx) => {
			await ctx.scene.leave({ cancelled: true });
			return ctx.send("cancelled");
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await user.sendCommand("quest");
	await user.sendCommand("cancel"); // reaches the command, not the step
	assert.deepEqual(leaves, [{ reason: "leave", cancelled: true }]);
	assert.equal(await storage.get(key), undefined);
	assert.deepEqual(sentTexts(env), ["name?", "cancelled"]);
});

test("passCommands: false makes commands ordinary step input", async () => {
	let cancelRan = 0;
	const collected: string[] = [];
	const bot = new Composer<Context>()
		.install(
			scenes(
				{
					greedy: {
						steps: [
							(ctx) => {
								if (ctx.scene.firstTime) return;
								collected.push(ctx.text ?? "");
								return ctx.scene.leave();
							},
						],
					},
				},
				{ passCommands: false },
			),
		)
		.command("go", (ctx) => ctx.scene.enter("greedy"))
		.command("cancel", () => {
			cancelRan++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await user.sendCommand("cancel");
	assert.equal(cancelRan, 0);
	assert.deepEqual(collected, ["/cancel"]);
});

test("unclaimed updates pass through; passthrough: false swallows them", async () => {
	const makeBot = (passthrough: boolean) => {
		let fellThrough = 0;
		const bot = new Composer<Context>()
			.install(
				scenes({ photos: { steps: [{ on: ":photo", handler: () => {} }] } }, { passthrough }),
			)
			.command("go", (ctx) => ctx.scene.enter("photos"))
			.on("message:text", () => {
				fellThrough++;
			});
		return { bot, fell: () => fellThrough };
	};

	const open = makeBot(true);
	const envOpen = createTestEnv(open.bot);
	const userOpen = envOpen.createUser();
	await userOpen.sendCommand("go");
	await userOpen.sendMessage("not a photo");
	assert.equal(open.fell(), 1); // fell through to the text handler

	const greedy = makeBot(false);
	const envGreedy = createTestEnv(greedy.bot);
	const userGreedy = envGreedy.createUser();
	await userGreedy.sendCommand("go");
	await userGreedy.sendMessage("not a photo");
	assert.equal(greedy.fell(), 0); // swallowed
});

test("an edited message never re-enters a wizard", async () => {
	let stepRuns = 0;
	let fellThrough = 0;
	const bot = new Composer<Context>()
		.install(
			scenes({
				wiz: {
					steps: [
						(ctx) => {
							if (!ctx.scene.firstTime) stepRuns++;
						},
					],
				},
			}),
		)
		.command("go", (ctx) => ctx.scene.enter("wiz"))
		.on("edited_message", () => {
			fellThrough++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await env.dispatch(
		editedMessageUpdate({ text: "edited old answer", chatId: user.pmChat.id, fromId: user.id }),
	);
	assert.equal(stepRuns, 0);
	assert.equal(fellThrough, 1);
});

test("wizards are per user per chat — group chatter can't answer for someone else", async () => {
	const answers: string[] = [];
	const bot = new Composer<Context>()
		.install(
			scenes({
				wiz: {
					steps: [
						(ctx) => {
							if (ctx.scene.firstTime) return;
							answers.push(`${ctx.from?.id}:${ctx.text}`);
							return ctx.scene.leave();
						},
					],
				},
			}),
		)
		.command("go", (ctx) => ctx.scene.enter("wiz"));

	const env = createTestEnv(bot);
	const group = env.createChat({ type: "group" });
	const alice = env.createUser();
	const bob = env.createUser();

	await alice.in(group).sendCommand("go");
	await bob.in(group).sendMessage("innocent chatter"); // bob is not in a scene
	await alice.in(group).sendMessage("my answer");
	assert.deepEqual(answers, [`${alice.id}:my answer`]);
});

test("entering an unknown scene throws and persists nothing", async () => {
	const storage = new MemoryStorage<SceneSnapshot>();
	const bot = new Composer<Context>()
		.install(scenes({ real: { steps: [() => {}] } }, { storage }))
		.command("go", (ctx) => ctx.scene.enter("tpyo" as "real"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await assert.rejects(user.sendCommand("go"), /unknown scene "tpyo".*registered: real/);
	assert.equal(await storage.get(`${user.pmChat.id}:${user.id}`), undefined);
});

test("a stale snapshot self-heals instead of shadowing the user forever", async () => {
	const storage = new MemoryStorage<SceneSnapshot>();
	let seen = "";
	const bot = new Composer<Context>()
		.install(scenes({ real: { steps: [() => {}] } }, { storage }))
		.on("message:text", (ctx) => {
			seen = ctx.text ?? "";
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;
	// a snapshot left behind by a previous deploy whose scene no longer exists
	storage.set(key, {
		scene: "ghost",
		step: 0,
		data: {},
		params: undefined,
		firstTime: false,
		updatedAt: Date.now(),
	});

	await user.sendMessage("hello");
	assert.equal(seen, "hello");
	assert.equal(await storage.get(key), undefined);
});

test("ttl expires an abandoned scene and fires onLeave with reason expired", async () => {
	let clock = 1_000;
	const leaves: LeaveInfo[] = [];
	let seen = "";
	const storage = new MemoryStorage<SceneSnapshot>();
	const slow = defineScene({
		steps: [ask("answer", { question: "still there?" })],
		onLeave: (_ctx, info) => {
			leaves.push(info);
		},
	});

	const bot = new Composer<Context>()
		.install(scenes({ slow }, { storage, ttl: 60_000, now: () => clock }))
		.command("go", (ctx) => ctx.scene.enter("slow"))
		.on("message:text", (ctx) => {
			seen = ctx.text ?? "";
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await user.sendCommand("go");
	clock += 61_000; // the user wandered off for a minute
	await user.sendMessage("back!");

	assert.deepEqual(leaves, [{ reason: "expired", cancelled: false }]);
	assert.equal(seen, "back!"); // the update flowed as if no scene were active
	assert.equal(await storage.get(key), undefined);
});

test("navigation: previous re-asks, named steps exist for go()", async () => {
	const flow = defineScene<Context, { a: string }>({
		steps: [
			ask("a", { question: "A?" }),
			{
				name: "review",
				handler: async (ctx) => {
					if (ctx.scene.firstTime) return ctx.send(`review: ${ctx.scene.state.a}`);
					if (ctx.text === "back") return ctx.scene.previous();
					return ctx.scene.leave();
				},
			},
		],
	});

	const bot = new Composer<Context>()
		.install(scenes({ flow }))
		.command("go", (ctx) => ctx.scene.enter("flow"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go"); // A?
	await user.sendMessage("one"); // review: one
	await user.sendMessage("back"); // previous → A? again
	await user.sendMessage("two"); // review: two
	assert.deepEqual(sentTexts(env), ["A?", "review: one", "A?", "review: two"]);
});

test("a step can claim callback queries via filter queries", async () => {
	const chosen: string[] = [];
	const pick = defineScene({
		steps: [
			{
				on: ["message", "callback_query:data"],
				handler: async (ctx) => {
					if (ctx.scene.firstTime)
						return ctx.send("pick a class", {
							reply_markup: {
								inline_keyboard: [[{ text: "mage", callback_data: "class:mage" }]],
							},
						});
					const data = ctx.update.callback_query?.data;
					if (data === undefined) return; // a stray message — stay on the step
					chosen.push(data);
					return ctx.scene.leave();
				},
			},
		],
	});

	const bot = new Composer<Context>()
		.install(scenes({ pick }))
		.command("go", (ctx) => ctx.scene.enter("pick"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await user.click("class:mage");
	assert.deepEqual(chosen, ["class:mage"]);
});

test("switching scenes fires onLeave with reason switch", async () => {
	const reasons: string[] = [];
	const a = defineScene({
		steps: [
			(ctx) => (ctx.scene.firstTime ? ctx.send("in a — say anything") : ctx.scene.enter("b")),
		],
		onLeave: (_ctx, info) => {
			reasons.push(`a:${info.reason}`);
		},
	});
	const b = defineScene({
		steps: [(ctx) => (ctx.scene.firstTime ? ctx.send("now in b") : ctx.scene.leave())],
		onLeave: (_ctx, info) => {
			reasons.push(`b:${info.reason}`);
		},
	});

	const bot = new Composer<Context>()
		.install(scenes({ a, b }))
		.command("go", (ctx) => ctx.scene.enter("a"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await user.sendMessage("next"); // a's processing pass switches to b
	await user.sendMessage("done"); // b leaves
	assert.deepEqual(reasons, ["a:switch", "b:leave"]);
	assert.deepEqual(sentTexts(env), ["in a — say anything", "now in b"]);
});

test("sub-scenes: enterSub suspends the parent, exitSub merges state back and re-asks", async () => {
	const order = defineScene<Context, { item?: string; qty?: number }>({
		steps: [
			{
				name: "item",
				handler: async (ctx) => {
					if (ctx.scene.firstTime)
						return ctx.send(`item? (so far: ${JSON.stringify(ctx.scene.state)})`);
					if (ctx.text === "count") return ctx.scene.enterSub("qty");
					ctx.scene.state.item = ctx.text;
					return ctx.scene.next();
				},
			},
			{
				handler: async (ctx) => {
					if (ctx.scene.firstTime) return ctx.send("confirm?");
					return ctx.scene.leave();
				},
			},
		],
	});
	const qty = defineScene<Context, { qty: number }>({
		steps: [
			ask("qty", {
				question: "how many?",
				parse: (text) => (/^\d+$/.test(text) ? Number(text) : undefined),
			}),
		],
		onLeave: async (ctx, info) => {
			if (info.reason === "finish") await ctx.scene.exitSub({ qty: ctx.scene.state.qty });
		},
	});

	const bot = new Composer<Context>()
		.install(scenes({ order, qty }))
		.command("order", (ctx) => ctx.scene.enter("order"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("order"); // item? (so far: {})
	await user.sendMessage("count"); // → sub-scene: how many?
	await user.sendMessage("3"); // sub finishes → exitSub merges → parent re-asks
	assert.deepEqual(sentTexts(env), [
		"item? (so far: {})",
		"how many?",
		'item? (so far: {"qty":3})',
	]);

	await user.sendMessage("lamp"); // parent continues where it left off
	assert.equal(sentTexts(env).at(-1), "confirm?");
});

test("params are typed and delivered; state can be seeded at enter", async () => {
	const seen: unknown[] = [];
	const edit = defineScene<Context, { draft: string }, { messageId: number }>({
		steps: [
			(ctx) => {
				seen.push([ctx.scene.params.messageId, ctx.scene.state.draft]);
				return ctx.scene.leave({ silent: true });
			},
		],
	});

	const bot = new Composer<Context>()
		.install(scenes({ edit }))
		.command("edit", (ctx) =>
			ctx.scene.enter("edit", { params: { messageId: 42 }, state: { draft: "hi" } }),
		);

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("edit");
	assert.deepEqual(seen, [[42, "hi"]]);
});

test("silent enter defers the question to the next claimed update", async () => {
	const bot = new Composer<Context>()
		.install(
			scenes({
				lazy: {
					steps: [
						(ctx) => (ctx.scene.firstTime ? ctx.send("finally: question") : ctx.scene.leave()),
					],
				},
			}),
		)
		.command("go", (ctx) => ctx.scene.enter("lazy", { silent: true }));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	assert.deepEqual(sentTexts(env), []); // nothing yet

	await user.sendMessage("hello?"); // consumed as the question pass
	assert.deepEqual(sentTexts(env), ["finally: question"]);
});

test("a persistent snapshot survives a bot restart mid-wizard", async () => {
	const storage = new MemoryStorage<SceneSnapshot>();
	const build = () =>
		new Composer<Context>()
			.install(
				scenes(
					{
						reg: defineScene<Context, { name: string; age: string }>({
							steps: [ask("name", { question: "name?" }), ask("age", { question: "age?" })],
							onLeave: (ctx, info) =>
								info.reason === "finish" &&
								ctx.send(`done: ${ctx.scene.state.name}/${ctx.scene.state.age}`),
						}),
					},
					{ storage },
				),
			)
			.command("reg", (ctx) => ctx.scene.enter("reg"));

	const envA = createTestEnv(build());
	const userA = envA.createUser({ id: 777 });
	await userA.sendCommand("reg");
	await userA.sendMessage("Linia"); // answered step 0, now at step 1

	// "restart": a fresh composer + env over the same storage
	const envB = createTestEnv(build());
	const userB = envB.createUser({ id: 777 });
	await userB.sendMessage("30");
	assert.deepEqual(sentTexts(envB), ["done: Linia/30"]);
});

test("installing scenes twice fails loud instead of silently shadowing ctx.scene", async () => {
	const bot = new Composer<Context>()
		.install(scenes({ a: { steps: [() => {}] } }))
		.install(scenes({ b: { steps: [() => {}] } }));

	const env = createTestEnv(bot);
	await assert.rejects(env.createUser().sendMessage("hi"), /already installed/);
});

test("entering from a keyless update throws loud", async () => {
	const bot = new Composer<Context>()
		.install(scenes({ wiz: { steps: [() => {}] } }))
		.on("inline_query", (ctx) => ctx.scene.enter("wiz"));

	const env = createTestEnv(bot);
	await assert.rejects(env.createUser().sendInlineQuery("hello"), /no storage key/);
});
