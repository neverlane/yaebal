import { conversation, createConversation } from "@yaebal/conversation";
import { Bot } from "@yaebal/core";
import { back, button, type DialogDef, dialogs, switchTo } from "@yaebal/morda";
import { prompt } from "@yaebal/prompt";
import { type SceneDef, scenes } from "@yaebal/scenes";
import { session } from "@yaebal/session";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/dialog-quest/.env first (copy .env.example)");
	process.exit(1);
}

interface Profile {
	name?: string;
	klass?: string;
	goal?: string;
	darkMode: boolean;
	tickets: string[];
}

const support = createConversation("support", async (cv, ctx) => {
	await ctx.send("support mode: describe the problem, or send /cancel.");
	const topic = await cv.wait();
	if (topic.text === "/cancel") {
		await topic.send("support flow cancelled.");
		return;
	}

	await topic.send("how urgent is it: low, normal, or fire?");
	const urgency = await cv.wait();
	if (urgency.text === "/cancel") {
		await urgency.send("support flow cancelled.");
		return;
	}

	await urgency.send(`ticket queued: ${topic.text ?? "no topic"} / urgency ${urgency.text ?? "normal"}`);
});

const questScene: SceneDef = {
	enter: (ctx) => ctx.reply("quest wizard: what is your name? send /cancel to leave."),
	steps: [
		(ctx) => {
			if (ctx.text === "/cancel") return ctx.scene.leave().then(() => ctx.reply("quest cancelled."));
			getProfile(ctx.chat?.id).name = ctx.text;
			ctx.scene.next();
			return ctx.reply(`nice, ${ctx.text}. choose a class: builder, mage, runner.`);
		},
		(ctx) => {
			if (ctx.text === "/cancel") return ctx.scene.leave().then(() => ctx.reply("quest cancelled."));
			getProfile(ctx.chat?.id).klass = ctx.text;
			ctx.scene.next();
			return ctx.reply(`class locked: ${ctx.text}. what is your launch goal?`);
		},
		(ctx) => {
			getProfile(ctx.chat?.id).goal = ctx.text;
			ctx.scene.leave();
			return ctx.reply(`quest saved: ${ctx.text}. open /profile to see the current state.`);
		},
	],
};

const dialogsByChat = new Map<number, Profile>();

const cockpit: DialogDef = {
	main: (ctx) => ({
		text: `cockpit\nprofile: ${profileLine(getProfile(ctx.chat?.id))}`,
		keyboard: [
			[switchTo("profile", "profile"), switchTo("settings", "settings")],
			[
				button("new quest", {
					id: "quest",
					onClick: (c) => c.send("run /quest to start the scene wizard."),
				}),
				button("support", {
					id: "support",
					onClick: (c) => c.send("run /support to start the coroutine flow."),
				}),
			],
		],
	}),
	profile: (ctx) => ({
		text: `profile\n${profileLine(getProfile(ctx.chat?.id))}`,
		keyboard: [[back("back")]],
	}),
	settings: (ctx) => ({
		text: `settings\ndark mode: ${getProfile(ctx.chat?.id).darkMode ? "on" : "off"}`,
		keyboard: [
			[
				button("toggle dark", {
					id: "dark",
					onClick: async (c) => {
						const profile = getProfile(c.chat?.id);
						profile.darkMode = !profile.darkMode;
						await c.dialog.rerender();
					},
				}),
			],
			[back("back")],
		],
	}),
};

const bot = new Bot(token)
	.install(session<Profile>({ initial: () => ({ darkMode: false, tickets: [] }) }))
	.derive((ctx) => {
		if (ctx.chat?.id !== undefined) dialogsByChat.set(ctx.chat.id, ctx.session);
		return {};
	})
	.install(scenes({ quest: questScene }))
	.install(prompt())
	.install(conversation([support]))
	.install(dialogs(cockpit))
	.command("start", (ctx) => ctx.dialog.start("main"))
	.command("quest", (ctx) => ctx.scene.enter("quest"))
	.command("support", (ctx) => {
		ctx.conversation.enter("support");
		return ctx.reply("support flow started.");
	})
	.command("rename", (ctx) =>
		ctx.prompt("new display name?", (answer) => {
			const next = answer as typeof ctx;
			next.session.name = answer.text;
			return answer.reply(`saved name: ${answer.text}`);
		}),
	)
	.command("profile", (ctx) => ctx.reply(profileLine(ctx.session)))
	.command("cancel", async (ctx) => {
		if (ctx.scene.current) await ctx.scene.leave();
		if (ctx.conversation.active()) ctx.conversation.leave();
		return ctx.reply("active flow cancelled.");
	})
	.on("message:text", (ctx) => ctx.reply("open /start, /quest, /support or /rename."))
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "open cockpit" },
					{ command: "quest", description: "start quest wizard" },
					{ command: "support", description: "start support flow" },
					{ command: "rename", description: "save display name" },
					{ command: "profile", description: "show profile" },
					{ command: "cancel", description: "leave active flow" },
				],
			})
			.catch(() => {});
		console.log(`@${info.username} dialog quest is live`);
	});
function getProfile(chatId: number | undefined): Profile {
	if (chatId === undefined) return { darkMode: false, tickets: [] };
	let profile = dialogsByChat.get(chatId);
	if (!profile) {
		profile = { darkMode: false, tickets: [] };
		dialogsByChat.set(chatId, profile);
	}
	return profile;
}

function profileLine(profile: Profile): string {
	return [
		`name: ${profile.name ?? "anonymous"}`,
		`class: ${profile.klass ?? "none"}`,
		`goal: ${profile.goal ?? "none"}`,
		`dark mode: ${profile.darkMode ? "on" : "off"}`,
	].join("\n");
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
