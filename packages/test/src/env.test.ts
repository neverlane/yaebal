import assert from "node:assert/strict";
import test from "node:test";
import { bold, Composer, type Context, format } from "@yaebal/core";
import { apiError } from "./api.js";
import { createTestEnv } from "./env.js";

test("createUser().sendMessage dispatches a message update and records the bot's reply", async () => {
	const bot = new Composer<Context>().on("message:text", (ctx) => ctx.reply("pong"));
	const env = createTestEnv(bot);
	const user = env.createUser({ firstName: "Linia" });

	await user.sendMessage("ping");

	assert.equal(env.apiCalls.length, 1);
	assert.equal(env.lastApiCall()?.method, "sendMessage");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "pong");
	assert.equal(env.lastApiCall()?.params?.chat_id, user.pmChat.id);
});

test("sendMessage(chat, text) sends into a group; .in(chat) scopes the same way", async () => {
	const bot = new Composer<Context>().on("message:text", (ctx) => ctx.reply("hi group"));
	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group", title: "devs" });

	await user.sendMessage(group, "hello");
	assert.equal(env.lastApiCall("sendMessage")?.params?.chat_id, group.id);

	env.clearApiCalls();
	await user.in(group).sendMessage("hello again");
	assert.equal(env.lastApiCall("sendMessage")?.params?.chat_id, group.id);
});

test("sendMessage accepts a format() result — entities are auto-extracted (rich integration)", async () => {
	let entityType: string | undefined;
	const bot = new Composer<Context>().on("message:text", (ctx) => {
		entityType = ctx.message?.entities?.[0]?.type;
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendMessage(format`Check out ${bold("this")}`);
	assert.equal(entityType, "bold");
});

test("sendCommand attaches a bot_command entity and parses args via Composer.command", async () => {
	let captured: { command: string; args: string[] } | undefined;
	const bot = new Composer<Context & { command: string; args: string[] }>().command(
		"start",
		(ctx) => {
			captured = { command: ctx.command, args: ctx.args };
		},
	);
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("start", "ref42");

	assert.deepEqual(captured, { command: "start", args: ["ref42"] });
});

test("sendReply sets reply_to_message and targets the same chat", async () => {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	const original = await user.sendMessage(group, "hello");
	const reply = await user.sendReply(original, "nice to meet you");

	assert.equal(reply.reply_to_message?.message_id, original.message_id);
	assert.equal(reply.chat.id, group.id);
});

test("media shortcuts attach a plausible attachment with auto file ids, caption entities, and spoiler", async () => {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const user = env.createUser();

	const photo = await user.sendPhoto({ caption: format`nice ${bold("shot")}`, spoiler: true });
	assert.ok(photo.photo?.length);
	assert.ok(photo.photo?.[0]?.file_id);
	assert.equal(photo.caption, "nice shot");
	assert.equal(photo.caption_entities?.[0]?.type, "bold");
	assert.equal(photo.has_media_spoiler, true);

	const sticker = await user.sendSticker({ emoji: "🔥" });
	assert.equal(sticker.sticker?.type, "regular");
	assert.equal(sticker.sticker?.emoji, "🔥");
});

test("sendMediaGroup dispatches one message per item, all sharing media_group_id", async () => {
	const groupIds: string[] = [];
	const bot = new Composer<Context>().on("message", (ctx) => {
		if (ctx.message?.media_group_id) groupIds.push(ctx.message.media_group_id);
	});
	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	const [m1, m2] = await user.sendMediaGroup(group, [
		{ photo: [{ file_id: "f1", file_unique_id: "u1", width: 100, height: 100 }] },
		{ photo: [{ file_id: "f2", file_unique_id: "u2", width: 100, height: 100 }] },
	]);

	assert.equal(groupIds.length, 2);
	assert.equal(m1?.media_group_id, m2?.media_group_id);
});

test("click() dispatches a callback_query the bot's callbackQuery() handler sees", async () => {
	let seenData: string | undefined;
	const bot = new Composer<Context>().callbackQuery("vote:up", (ctx) => {
		seenData = ctx.callbackQuery.data;
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.click("vote:up");
	assert.equal(seenData, "vote:up");
});

test("lastBotMessage() stays in sync with editMessageText/editMessageReplyMarkup, even on an earlier reference", async () => {
	const bot = new Composer<Context>()
		.on("message:text", (ctx) =>
			ctx.send("Pick:", {
				reply_markup: { inline_keyboard: [[{ text: "Next", callback_data: "next" }]] },
			}),
		)
		.callbackQuery("next", async (ctx) => {
			const msg = ctx.callbackQuery.message as { chat: { id: number }; message_id: number };
			await ctx.api.call("editMessageText", {
				chat_id: msg.chat.id,
				message_id: msg.message_id,
				text: "Done!",
			});
			await ctx.api.call("editMessageReplyMarkup", {
				chat_id: msg.chat.id,
				message_id: msg.message_id,
				reply_markup: { inline_keyboard: [[{ text: "Restart", callback_data: "restart" }]] },
			});
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendMessage("hi");
	const bubble = env.lastBotMessage();
	assert.ok(bubble);
	assert.ok(bubble.reply_markup);

	await user.on(bubble).clickByText("Next");

	assert.equal(env.lastBotMessage(), bubble); // same reference
	assert.equal(bubble.text, "Done!");
	assert.equal((bubble.reply_markup?.inline_keyboard as unknown[][])[0]?.length, 1);

	await user.on(bubble).clickByText("Restart");
});

test("lastBotMessage() query filters: chat, withReplyMarkup, where", async () => {
	const bot = new Composer<Context>().on("message:text", (ctx) => {
		if (ctx.text === "plain") return ctx.reply("no markup");
		return ctx.reply("with markup", {
			reply_markup: { inline_keyboard: [[{ text: "x", callback_data: "x" }]] },
		});
	});
	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	await user.sendMessage("plain");
	await user.sendMessage(group, "keyboard");

	assert.equal(env.lastBotMessage({ chat: user.pmChat })?.text, "no markup");
	assert.equal(env.lastBotMessage({ withReplyMarkup: true })?.chat.id, group.id);
	assert.equal(
		env.lastBotMessage({
			where: (call) => call.method === "sendMessage" && call.params?.chat_id === group.id,
		})?.text,
		"with markup",
	);
});

test("react() infers old_reaction from this user's last reaction on the message", async () => {
	const seen: Array<{ old: string[]; new: string[] }> = [];
	const bot = new Composer<Context>().on("message_reaction", (ctx) => {
		const r = ctx.update.message_reaction;
		if (!r) return;
		seen.push({
			old: r.old_reaction.map((x) => ("emoji" in x ? x.emoji : "")),
			new: r.new_reaction.map((x) => ("emoji" in x ? x.emoji : "")),
		});
	});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const msg = await user.sendMessage("nice bot");

	await user.react("👍", msg);
	await user.react("❤", msg);
	await user.react([], msg);

	assert.deepEqual(seen[0], { old: [], new: ["👍"] });
	assert.deepEqual(seen[1], { old: ["👍"], new: ["❤"] });
	assert.deepEqual(seen[2], { old: ["❤"], new: [] });
});

test("join()/leave() track chat.members and dispatch chat_member + a service message", async () => {
	const serviceMessages: string[] = [];
	const bot = new Composer<Context>().on("message", (ctx) => {
		if (ctx.message?.new_chat_members) serviceMessages.push("joined");
		if (ctx.message?.left_chat_member) serviceMessages.push("left");
	});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	await user.join(group);
	assert.equal(group.members.has(user), true);
	assert.equal(group.membershipOf(user)?.status, "member");
	assert.deepEqual(serviceMessages, ["joined"]);

	await user.leave(group);
	assert.equal(group.members.has(user), false);
	assert.equal(group.membershipOf(user)?.status, "left");
	assert.deepEqual(serviceMessages, ["joined", "left"]);
});

test("sendInlineQuery / chooseInlineResult dispatch their updates", async () => {
	let query: string | undefined;
	let chosen: string | undefined;
	const bot = new Composer<Context>()
		.on("inline_query", (ctx) => {
			query = ctx.update.inline_query?.query;
		})
		.on("chosen_inline_result", (ctx) => {
			chosen = ctx.update.chosen_inline_result?.result_id;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	await user.sendInlineQuery("cats", group);
	await user.chooseInlineResult("r1", "cats");

	assert.equal(query, "cats");
	assert.equal(chosen, "r1");
});

test("sendSuccessfulPayment throws unless the bot answered pre_checkout_query with ok: true", async () => {
	const notHandling = createTestEnv(new Composer<Context>());
	await assert.rejects(
		notHandling.createUser().sendSuccessfulPayment({ invoice_payload: "x" }),
		/never answered the pre_checkout_query/,
	);

	const rejecting = createTestEnv(
		new Composer<Context>().on("pre_checkout_query", async (ctx) => {
			await ctx.api.call("answerPreCheckoutQuery", {
				pre_checkout_query_id: ctx.update.pre_checkout_query?.id,
				ok: false,
			});
		}),
	);
	await assert.rejects(rejecting.createUser().sendSuccessfulPayment({ invoice_payload: "x" }));

	let paid: string | undefined;
	const accepting = createTestEnv(
		new Composer<Context>()
			.on("pre_checkout_query", async (ctx) => {
				await ctx.api.call("answerPreCheckoutQuery", {
					pre_checkout_query_id: ctx.update.pre_checkout_query?.id,
					ok: true,
				});
			})
			.on("message", (ctx) => {
				paid = ctx.message?.successful_payment?.invoice_payload;
			}),
	);
	await accepting.createUser().sendSuccessfulPayment({ invoice_payload: "sub_monthly" });
	assert.equal(paid, "sub_monthly");
});

test("onApi/apiError let a test simulate a Telegram failure the bot must handle", async () => {
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		try {
			await ctx.reply("hi");
		} catch {
			// swallow — this bot doesn't retry, just shouldn't crash the test
		}
	});
	const env = createTestEnv(bot);
	env.onApi("sendMessage", apiError(403, "Forbidden: bot was blocked by the user"));

	await env.createUser().sendMessage("hi");
	assert.equal(env.lastApiCall("sendMessage")?.error instanceof Error, true);
});

test("strictDispatch throws when no handler consumes the update", async () => {
	const env = createTestEnv(new Composer<Context>(), { strictDispatch: true });
	await assert.rejects(env.createUser().sendMessage("hi"), /no handler consumed/);
});

test("advanceTime() lets code under test skip a real setTimeout wait", async () => {
	let resumed = false;
	const bot = new Composer<Context>().on("message", () => {
		setTimeout(() => {
			resumed = true;
		}, 5000);
	});

	const env = createTestEnv(bot);
	env.useFakeTimers(); // arm before the handler schedules its setTimeout
	await env.createUser().sendMessage("hi");

	assert.equal(resumed, false);
	await env.advanceTime(5000);
	assert.equal(resumed, true);

	env.shutdown();
});

test("chat.post() emits an anonymous channel_post and throws on non-channel chats", async () => {
	let fromIsUndefined = false;
	const bot = new Composer<Context>().on("channel_post", (ctx) => {
		fromIsUndefined = ctx.update.channel_post?.from === undefined;
	});
	const env = createTestEnv(bot);
	const channel = env.createChat({ type: "channel", title: "News" });
	const group = env.createChat({ type: "group" });

	await channel.post("breaking news");
	assert.equal(fromIsUndefined, true);

	await assert.rejects(group.post("nope"), /only channel chats can post/);
});

test("onPostDispatch hooks run after each dispatched update, in registration order", async () => {
	const order: string[] = [];
	const env = createTestEnv(new Composer<Context>());
	env.onPostDispatch(() => {
		order.push("first");
	});
	env.onPostDispatch(() => {
		order.push("second");
	});

	await env.createUser().sendMessage("hi");
	assert.deepEqual(order, ["first", "second"]);
});

test("packs: setup(env) runs at construction time and can seed api overrides", () => {
	let ran = false;
	const env = createTestEnv(new Composer<Context>(), {
		packs: [
			{
				name: "probe",
				setup(e) {
					ran = true;
					e.onApi("getMe", { id: 99, is_bot: true, first_name: "probe" });
				},
			},
		],
	});

	assert.equal(ran, true);
	return env.api.getMe().then((me) => assert.equal(me.id, 99));
});
