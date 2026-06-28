import { type ChatMessage, renderChat } from "@yaebal/preview";
import { type RecordedCall, callbackUpdate, messageUpdate, mockApi } from "@yaebal/test";
import { type Bot, createBot, richContext } from "yaebal";

export type Step = { user: string } | { click: string; label?: string };

interface InlineBtn {
	text: string;
}

const cap = (s: string): string => (s.length > 600 ? `${s.slice(0, 600)}…` : s);

export function mapCall(c: RecordedCall): Partial<ChatMessage> | null {
	const p = (c.params ?? {}) as Record<string, unknown>;
	const rm = p.reply_markup as { inline_keyboard?: InlineBtn[][] } | undefined;
	const buttons = rm?.inline_keyboard?.map((row) => row.map((b) => b.text));
	switch (c.method) {
		case "sendMessage":
		case "editMessageText":
			return { text: cap(String(p.text ?? "")), buttons };
		case "sendPhoto":
			return { photo: [], caption: p.caption ? cap(String(p.caption)) : undefined, buttons };
		case "answerCallbackQuery":
			return null;
		default:
			return { text: `· ${c.method}` };
	}
}

export async function runScenario(
	setup: (bot: Bot) => void,
	steps: Step[],
	width = 360,
	theme: "light" | "dark" = "light",
): Promise<string> {
	const { bot, calls } = mockBot();
	setup(bot);

	const convo = await feedSteps(bot, calls, steps);
	return renderChat(convo, { theme, width: Math.max(280, width) });
}

export function mockBot(): { bot: Bot; calls: RecordedCall[] } {
	const { api, calls } = mockApi();
	const bot = createBot("playground:token", {
		contextFactory: (_api, update, type) => richContext(api, update, type),
	});

	return { bot, calls };
}

export async function feedSteps(
	bot: Bot,
	calls: RecordedCall[],
	steps: Step[],
): Promise<ChatMessage[]> {
	const convo: ChatMessage[] = [];

	for (const step of steps) {
		const before = calls.length;
		if ("user" in step) {
			convo.push({ from: "user", text: step.user, status: "read" });
			await bot.handleUpdate(messageUpdate({ text: step.user }));
		} else {
			convo.push({ from: "user", text: step.label ?? step.click, status: "read" });
			await bot.handleUpdate(callbackUpdate({ data: step.click }));
		}
		for (const c of calls.slice(before)) {
			const msg = mapCall(c);
			if (msg) convo.push({ from: "bot", name: "bot", ...msg });
		}
	}
	
	return convo;
}
