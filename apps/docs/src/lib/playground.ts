import type { ChatMessage } from "@yaebal/preview";
import {
	type RecordedCall,
	callbackUpdate,
	inlineQueryUpdate,
	messageUpdate,
	preCheckoutQueryUpdate,
} from "@yaebal/test";
import type { Bot } from "yaebal";

export type Step =
	| { user: string }
	| { click: string; label?: string }
	| { inline: string }
	| { preCheckout: string }
	| { system: string }
	| { wait: number };

/** a chat message stamped with its virtual time (ms since scenario start). */
export type TimedMessage = ChatMessage & { at?: number };

/** the slice of a @yaebal/test TestClock that feedSteps drives. */
export interface StepClock {
	now(): number;
	advance(ms: number): Promise<void>;
}

/** how much virtual time to run out after the last step so pending timers fire. */
export const SETTLE_MS = 5000;

const fmtSecs = (ms: number): string => {
	const s = ms / 1000;
	return `${s % 1 ? s.toFixed(1) : s}s`;
};

export function formatStep(step: Step): string {
	if ("user" in step) return step.user;
	if ("system" in step) return `system:${step.system}`;
	if ("inline" in step) return `inline:${step.inline}`;
	if ("preCheckout" in step) return `pre_checkout:${step.preCheckout}`;
	if ("wait" in step) return `wait:${step.wait}`;

	return `click:${step.click}`;
}

export function formatSteps(value: Step[]): string {
	return value.map(formatStep).join("\n");
}

/** `wait:` accepts plain ms (`wait:1500`) or seconds with a suffix (`wait:1.5s`). */
function parseWait(raw: string): number {
	const trimmed = raw.trim();
	const n = trimmed.endsWith("s") ? Number(trimmed.slice(0, -1)) * 1000 : Number(trimmed);

	return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function parseSteps(value: string): Step[] {
	const steps: Step[] = [];

	for (const raw of value.split("\n")) {
		const line = raw.trim();
		if (!line) continue;

		if (line.startsWith("system:")) {
			const system = line.slice("system:".length).trim();
			if (system) steps.push({ system });
		} else if (line.startsWith("inline:")) {
			steps.push({ inline: line.slice("inline:".length).trim() });
		} else if (line.startsWith("pre_checkout:")) {
			steps.push({ preCheckout: line.slice("pre_checkout:".length).trim() });
		} else if (line.startsWith("wait:")) {
			const wait = parseWait(line.slice("wait:".length));
			if (wait) steps.push({ wait });
		} else if (line.startsWith("click:")) {
			const [click = ""] = line.slice("click:".length).split("|", 1);
			steps.push({ click: click.trim() });
		} else {
			steps.push({ user: line });
		}
	}

	return steps;
}

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

/**
 * replay `steps` against the bot and assemble the conversation. with a `clock`
 * (a @yaebal/test virtual clock installed by the runner) delayed replies work:
 * due timers are flushed after every update, `wait:` steps advance virtual time,
 * and after the last step the clock runs {@link SETTLE_MS} further so trailing
 * `setTimeout` replies still land. every message carries `at` — virtual ms since
 * the scenario started — which the result pane uses to pace the reveal animation.
 */
export async function feedSteps(
	bot: Bot,
	calls: RecordedCall[],
	steps: Step[],
	clock?: StepClock,
): Promise<TimedMessage[]> {
	const convo: TimedMessage[] = [];
	const callbackLabels = new Map<string, string>();
	let nextMessageId = 1;
	let lastBotMessageId: number | undefined;
	let ts = 0;

	const startAt = clock?.now() ?? 0;
	const now = () => (clock ? clock.now() - startAt : ts);
	const stamp = (at: number): string => (clock ? `, t+${fmtSecs(at)}` : "");

	const collect = (from: number) => {
		for (const c of calls.slice(from)) {
			const at = clock ? Math.max(0, c.at - startAt) : ts;
			collectCallbackLabels(c.params?.reply_markup, callbackLabels);

			if (c.method === "answerCallbackQuery") {
				const text = answerText(c.params);
				convo.push({
					from: "system",
					text: text ? `callback answered: ${quote(text)}` : "callback answered",
					at,
				});
				continue;
			}

			if (c.method === "answerInlineQuery") {
				const results = Array.isArray(c.params?.results) ? c.params.results.length : 0;
				convo.push({ from: "system", text: `inline answered: ${results} result(s)`, at });
				continue;
			}

			if (c.method === "answerPreCheckoutQuery") {
				const ok = c.params?.ok === true;
				const error = typeof c.params?.error_message === "string" ? `: ${c.params.error_message}` : "";
				convo.push({
					from: "system",
					text: ok ? "pre-checkout approved" : `pre-checkout rejected${error}`,
					at,
				});
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
				at,
				debug: edited
					? `edited message, ts: ${ts}, id: ${messageId}${stamp(at)}`
					: `${c.method}, ts: ${ts}, id: ${messageId}${replyTo}${stamp(at)}`,
			});
		}
	};

	for (const step of steps) {
		ts += 1;
		const before = calls.length;

		if ("system" in step) {
			convo.push({ from: "system", text: step.system, at: now() });
			continue;
		}

		if ("wait" in step) {
			convo.push({ from: "system", text: `⏱ waited ${fmtSecs(step.wait)}`, at: now() });
			await clock?.advance(step.wait);
			collect(before);
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
				at: now(),
				debug: `incoming message, ts: ${ts}, id: ${messageId}`,
			});
			await bot.handleUpdate(update);
		} else if ("inline" in step) {
			convo.push({ from: "system", text: `inline query: ${quote(step.inline)}`, at: now() });
			await bot.handleUpdate(inlineQueryUpdate({ query: step.inline }));
		} else if ("preCheckout" in step) {
			convo.push({
				from: "system",
				text: `pre-checkout query: ${quote(step.preCheckout)}`,
				at: now(),
			});
			await bot.handleUpdate(preCheckoutQueryUpdate({ invoicePayload: step.preCheckout }));
		} else {
			const label = callbackLabels.get(step.click) ?? step.click;
			const targetId = lastBotMessageId ?? 1;
			const update = callbackUpdate({ data: step.click });
			setMessageId(update, targetId);

			convo.push({
				from: "system",
				text: `inline pressed: button ${quote(label)} with data ${quote(step.click)}`,
				at: now(),
			});
			await bot.handleUpdate(update);
		}

		// fire timers that came due while handling (setTimeout(fn, 0) and friends)
		await clock?.advance(0);
		collect(before);
	}

	// run out trailing timers so delayed replies after the last step still render
	if (clock) {
		const before = calls.length;
		await clock.advance(SETTLE_MS);
		collect(before);
	}

	return convo;
}
