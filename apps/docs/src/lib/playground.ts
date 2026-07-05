import { type ChatMessage, renderChat } from "@yaebal/preview";
import {
	type RecordedCall,
	callbackUpdate,
	inlineQueryUpdate,
	messageUpdate,
	mockApi,
	preCheckoutQueryUpdate,
} from "@yaebal/test";
import { type Bot, createBot, richContext } from "yaebal";

export type Step =
	| { user: string }
	| { click: string; label?: string }
	| { inline: string }
	| { preCheckout: string }
	| { system: string };

interface InlineBtn {
	text: string;
	callback_data?: string;
}

type KeyboardBtn = string | InlineBtn;

interface ReplyMarkup {
	inline_keyboard?: InlineBtn[][];
	keyboard?: KeyboardBtn[][];
}

const cap = (s: string): string => (s.length > 600 ? `${s.slice(0, 600)}…` : s);

const asText = (v: unknown, fallback = ""): string => cap(String(v ?? fallback));

function buttonText(button: KeyboardBtn): string {
	return typeof button === "string" ? button : button.text;
}

function mapButtons(markup: unknown): string[][] | undefined {
	const rm = markup as ReplyMarkup | undefined;
	const keyboard = rm?.inline_keyboard ?? rm?.keyboard;

	return keyboard?.map((row) => row.map(buttonText));
}

function collectCallbackLabels(markup: unknown, labels: Map<string, string>): void {
	const rm = markup as ReplyMarkup | undefined;

	for (const row of rm?.inline_keyboard ?? []) {
		for (const button of row) {
			if (button.callback_data) labels.set(button.callback_data, button.text);
		}
	}
}

function quote(value: string): string {
	return `"${value.replaceAll('"', '\\"')}"`;
}

function answerText(params: Record<string, unknown> | undefined): string {
	if (typeof params?.text === "string") return params.text;

	const chars = Object.entries(params ?? {})
		.filter(([key, value]) => /^\d+$/.test(key) && typeof value === "string")
		.sort(([a], [b]) => Number(a) - Number(b))
		.map(([, value]) => value as string);

	return chars.join("");
}

function setMessageId(update: unknown, messageId: number): void {
	const u = update as {
		message?: { message_id?: number };
		callback_query?: { message?: { message_id?: number } };
	};

	if (u.message) u.message.message_id = messageId;
	if (u.callback_query?.message) u.callback_query.message.message_id = messageId;
}

const isEditCall = (method: string): boolean => method.startsWith("editMessage");

const fileId = (v: unknown, fallback: string): string => String(v ?? fallback);

const mediaMeta = (v: unknown): Record<string, unknown> =>
	typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

function invoiceAmount(prices: unknown): string {
	if (!Array.isArray(prices)) return "";

	const total = prices.reduce((sum, price) => {
		const amount = typeof price === "object" && price !== null ? (price as { amount?: unknown }).amount : 0;
		return sum + Number(amount ?? 0);
	}, 0);

	return total > 0 ? `\namount: ${total}` : "";
}

export function mapCall(c: RecordedCall): Partial<ChatMessage> | null {
	const p = (c.params ?? {}) as Record<string, unknown>;
	const buttons = mapButtons(p.reply_markup);
	const entities = p.entities as ChatMessage["entities"] | undefined;
	const captionEntities = p.caption_entities as ChatMessage["captionEntities"] | undefined;
	const caption = p.caption ? asText(p.caption) : undefined;
	const common = { buttons, caption, captionEntities };

	switch (c.method) {
		case "sendMessage":
		case "editMessageText":
			return { text: asText(p.text), entities, buttons };
		case "editMessageCaption":
			return { caption: caption ?? "", captionEntities, buttons };
		case "sendPhoto":
			return { photo: [], ...common };
		case "sendAnimation": {
			const m = mediaMeta(p.animation);
			return {
				animation: {
					file_id: fileId(p.animation, "animation"),
					file_unique_id: "animation",
					width: Number(m.width ?? 320),
					height: Number(m.height ?? 180),
					duration: Number(m.duration ?? 0),
				} as ChatMessage["animation"],
				...common,
			};
		}
		case "sendVideo": {
			const m = mediaMeta(p.video);
			return {
				video: {
					file_id: fileId(p.video, "video"),
					file_unique_id: "video",
					width: Number(m.width ?? 320),
					height: Number(m.height ?? 180),
					duration: Number(m.duration ?? 0),
				} as ChatMessage["video"],
				...common,
			};
		}
		case "sendVoice":
			return {
				voice: {
					file_id: fileId(p.voice, "voice"),
					file_unique_id: "voice",
					duration: Number(mediaMeta(p.voice).duration ?? p.duration ?? 0),
				} as ChatMessage["voice"],
				buttons,
			};
		case "sendAudio": {
			const m = mediaMeta(p.audio);
			return {
				audio: {
					file_id: fileId(p.audio, "audio"),
					file_unique_id: "audio",
					duration: Number(m.duration ?? p.duration ?? 0),
					performer: String(m.performer ?? p.performer ?? ""),
					title: String(m.title ?? p.title ?? "audio"),
					file_name: String(m.file_name ?? p.title ?? "audio"),
				} as ChatMessage["audio"],
				...common,
			};
		}
		case "sendDocument": {
			const m = mediaMeta(p.document);
			return {
				document: {
					file_id: fileId(p.document, "document"),
					file_unique_id: "document",
					file_name: String(m.file_name ?? p.file_name ?? "document"),
					mime_type: String(m.mime_type ?? p.mime_type ?? "file"),
					file_size: Number(m.file_size ?? p.file_size ?? 0),
				} as ChatMessage["document"],
				...common,
			};
		}
		case "sendLocation":
			return {
				location: {
					latitude: Number(p.latitude ?? 0),
					longitude: Number(p.longitude ?? 0),
				} as ChatMessage["location"],
				buttons,
			};
		case "sendVenue":
			return {
				venue: {
					location: { latitude: Number(p.latitude ?? 0), longitude: Number(p.longitude ?? 0) },
					title: String(p.title ?? "venue"),
					address: String(p.address ?? ""),
				} as ChatMessage["venue"],
				buttons,
			};
		case "sendContact":
			return {
				contact: {
					phone_number: String(p.phone_number ?? ""),
					first_name: String(p.first_name ?? "contact"),
					last_name: p.last_name ? String(p.last_name) : undefined,
				} as ChatMessage["contact"],
				buttons,
			};
		case "sendPoll":
			return {
				poll: {
					id: "poll",
					question: String(p.question ?? "poll"),
					options: Array.isArray(p.options)
						? p.options.map((o, i) => ({ text: String(o), voter_count: i === 0 ? 1 : 0 }))
						: [],
					total_voter_count: 1,
					is_closed: false,
					is_anonymous: true,
					type: "regular",
					allows_multiple_answers: false,
				} as ChatMessage["poll"],
				buttons,
			};
		case "sendInvoice":
			return {
				text: `invoice: ${asText(p.title, "invoice")}\n${asText(p.description)}${invoiceAmount(p.prices)}`,
				buttons,
			};
		case "answerCallbackQuery":
			return null;
		case "answerInlineQuery":
		case "answerPreCheckoutQuery":
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
	const callbackLabels = new Map<string, string>();
	let nextMessageId = 1;
	let lastBotMessageId: number | undefined;
	let ts = 0;

	for (const step of steps) {
		ts += 1;
		const before = calls.length;

		if ("system" in step) {
			convo.push({ from: "system", text: step.system });
			continue;
		}

		if ("user" in step) {
			const messageId = nextMessageId++;
			const update = messageUpdate({ text: step.user });
			setMessageId(update, messageId);

			convo.push({
				from: "user",
				text: step.user,
				status: "read",
				messageId,
				debug: `incoming message, ts: ${ts}, id: ${messageId}`,
			});
			await bot.handleUpdate(update);
		} else if ("inline" in step) {
			convo.push({ from: "system", text: `inline query: ${quote(step.inline)}` });
			await bot.handleUpdate(inlineQueryUpdate({ query: step.inline }));
		} else if ("preCheckout" in step) {
			convo.push({ from: "system", text: `pre-checkout query: ${quote(step.preCheckout)}` });
			await bot.handleUpdate(preCheckoutQueryUpdate({ invoicePayload: step.preCheckout }));
		} else {
			const label = callbackLabels.get(step.click) ?? step.click;
			const targetId = lastBotMessageId ?? 1;
			const update = callbackUpdate({ data: step.click });
			setMessageId(update, targetId);

			convo.push({
				from: "system",
				text: `inline pressed: button ${quote(label)} with data ${quote(step.click)}`,
			});
			await bot.handleUpdate(update);
		}

		for (const c of calls.slice(before)) {
			collectCallbackLabels(c.params?.reply_markup, callbackLabels);

			if (c.method === "answerCallbackQuery") {
				const text = answerText(c.params);
				convo.push({
					from: "system",
					text: text ? `callback answered: ${quote(text)}` : "callback answered",
				});
				continue;
			}

			if (c.method === "answerInlineQuery") {
				const results = Array.isArray(c.params?.results) ? c.params.results.length : 0;
				convo.push({ from: "system", text: `inline answered: ${results} result(s)` });
				continue;
			}

			if (c.method === "answerPreCheckoutQuery") {
				const ok = c.params?.ok === true;
				const error = typeof c.params?.error_message === "string" ? `: ${c.params.error_message}` : "";
				convo.push({ from: "system", text: ok ? "pre-checkout approved" : `pre-checkout rejected${error}` });
				continue;
			}

			const msg = mapCall(c);
			if (!msg) continue;

			const params = c.params ?? {};
			const edited = isEditCall(c.method);
			const messageId = edited
				? Number(params.message_id ?? lastBotMessageId ?? nextMessageId)
				: nextMessageId++;
			const replyTo =
				typeof params.reply_parameters === "object" &&
				params.reply_parameters !== null &&
				"message_id" in params.reply_parameters
					? `, reply_to: ${(params.reply_parameters as { message_id: unknown }).message_id}`
					: "";

			if (!edited) lastBotMessageId = messageId;

			convo.push({
				from: "bot",
				name: "bot",
				...msg,
				messageId,
				debug: edited
					? `edited message, ts: ${ts}, id: ${messageId}`
					: `${c.method}, ts: ${ts}, id: ${messageId}${replyTo}`,
			});
		}
	}

	return convo;
}
