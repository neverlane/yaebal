import { conversation, createConversation } from "@yaebal/conversation";
import { back, button, type DialogDef, dialogs, switchTo } from "@yaebal/morda";
import { prompt } from "@yaebal/prompt";
import { ask, defineScene, scenes } from "@yaebal/scenes";
import { type Context, createBot, session } from "yaebal";

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

// waitFor narrows to a fresh text message, so topic.text is a plain string — no "?? fallback"
// needed. /cancel needs no special-casing here either: passCommands (on by default) routes it
// straight to the global "cancel" command below, which leaves the conversation for us.
const support = createConversation(async (cv, ctx) => {
	await ctx.send("support mode: describe the problem, or send /cancel.");
	const topic = await cv.waitFor("message:text");

	const urgency = await cv.form.choice({
		question: "how urgent is it: low, normal, or fire?",
		choices: ["low", "normal", "fire"] as const,
		invalid: "pick one: low, normal, or fire.",
	});

	await ctx.send(`ticket queued: ${topic.text} / urgency ${urgency}`);
});

// answers collect in the typed ctx.scene.state bag (no external map needed) and
// land in ctx.session only on finish. the def's context requires the session
// plugin, so installing scenes before session would be a compile error. a global
// /cancel keeps working mid-wizard — commands bypass active scenes by default.
const questScene = defineScene<
	Context & { session: Profile },
	{ name: string; klass: string; goal: string }
>({
	steps: [
		ask("name", { question: "quest wizard: what is your name? send /cancel to leave." }),
		ask("klass", {
			question: (ctx) => `nice, ${ctx.scene.state.name}. choose a class: builder, mage, runner.`,
			parse: (text) => {
				const klass = text.trim().toLowerCase();
				return ["builder", "mage", "runner"].includes(klass) ? klass : undefined;
			},
			invalid: "builder, mage or runner — pick one.",
		}),
		ask("goal", {
			question: (ctx) => `class locked: ${ctx.scene.state.klass}. what is your launch goal?`,
		}),
	],
	onLeave: async (ctx, info) => {
		if (info.cancelled) return ctx.reply("quest cancelled.");
		if (info.reason !== "finish") return;

		Object.assign(ctx.session, ctx.scene.state);
		return ctx.reply(
			`quest saved: ${ctx.scene.state.goal}. open /profile to see the current state.`,
		);
	},
});

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

const bot = createBot(token)
	.install(session<Profile>({ initial: () => ({ darkMode: false, tickets: [] }) }))
	.derive((ctx) => {
		if (ctx.chat?.id !== undefined) dialogsByChat.set(ctx.chat.id, ctx.session);
		return {};
	})
	.install(scenes({ quest: questScene }))
	.install(prompt())
	.install(conversation({ support }))
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
		// reachable mid-wizard: commands pass through both an active scene and an active
		// conversation by default (scenes' passCommands, conversation's passCommands)
		if (ctx.scene.active) return ctx.scene.leave({ cancelled: true });
		if (ctx.conversation.active) await ctx.conversation.leave();
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
