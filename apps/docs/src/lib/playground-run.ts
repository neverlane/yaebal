import { type ChatMessage, renderChat } from "@yaebal/preview";
import { transform } from "sucrase";

import * as yaebal from "yaebal";
import * as ypreview from "@yaebal/preview";
import * as ytest from "@yaebal/test";

import { type Step, feedSteps, mapCall } from "./playground";

export type LogLine = { level: "log" | "warn" | "error"; text: string };

type AnyBot = Parameters<typeof feedSteps>[0];

let mockRunId = 0;

export interface RunResult {
	svg: string;
	logs: { level: "log" | "warn" | "error"; text: string }[];
	error?: string;
}

const fmt = (args: unknown[]): string =>
	args
		.map((a) => {
			if (typeof a === "string") return a;

			try {
				return JSON.stringify(a);
			} catch {
				return String(a);
			}
		})
		.join(" ");

async function runUserCodeInline(
	code: string,
	steps: Step[],
	width = 360,
	theme: "light" | "dark" = "light",
): Promise<RunResult> {
	const logs: RunResult["logs"] = [];
	const sandboxConsole = {
		log: (...a: unknown[]) => logs.push({ level: "log", text: fmt(a) }),
		info: (...a: unknown[]) => logs.push({ level: "log", text: fmt(a) }),
		debug: (...a: unknown[]) => logs.push({ level: "log", text: fmt(a) }),
		warn: (...a: unknown[]) => logs.push({ level: "warn", text: fmt(a) }),
		error: (...a: unknown[]) => logs.push({ level: "error", text: fmt(a) }),
	};

	let js: string;
	try {
		js = transform(code, { transforms: ["typescript", "imports"], filePath: "playground.ts" }).code;
	} catch (e) {
		return { svg: "", logs, error: `compile: ${e instanceof Error ? e.message : String(e)}` };
	}

	const { api, calls } = ytest.mockApi();
	const wire = {
		contextFactory: (_a: unknown, u: unknown, t: unknown) =>
			yaebal.richContext(api, u as never, t as never),
	};

	let captured: AnyBot | null = null;
	const tame = (b: AnyBot): AnyBot => {
		captured = b;
		(b as { start: () => Promise<void> }).start = async () => {};
		
		return b;
	};

	class PatchedBot extends (yaebal.Bot as new (t: string, o?: object) => AnyBot) {
		constructor(token?: string, options: object = {}) {
			super(token || "playground", { ...options, ...wire });
			tame(this as AnyBot);
		}
	}

	const patchedCreateBot = (token?: string, options: object = {}) =>
		tame(yaebal.createBot(token || "playground", { ...options, ...wire }));

	const patched = { ...yaebal, Bot: PatchedBot, createBot: patchedCreateBot };
	const modules: Record<string, unknown> = {
		yaebal: patched,
		"@yaebal/core": patched,
		"@yaebal/fmt": yaebal,
		"@yaebal/keyboard": yaebal,
		"@yaebal/test": ytest,
		"@yaebal/preview": ypreview,
	};
	const require = (name: string): unknown => {
		const m = modules[name];
		if (!m) throw new Error(`cannot import "${name}" in the playground`);
		
		return m;
	};

	try {
		const mod = { exports: {} };
		const fn = new Function("require", "console", "process", "exports", "module", js);
		
		await fn(require, sandboxConsole, { env: {}, argv: [] }, mod.exports, mod);
	} catch (e) {
		return { svg: "", logs, error: `runtime: ${e instanceof Error ? e.message : String(e)}` };
	}

	if (!captured) {
		return { svg: "", logs, error: "no bot created — make one with new Bot(...) or createBot(...)" };
	}

	try {
		const convo = await feedSteps(captured, calls, steps);
		return { svg: renderChat(convo, { theme, width: Math.max(280, width) }), logs };
	} catch (e) {
		return { svg: "", logs, error: `runtime: ${e instanceof Error ? e.message : String(e)}` };
	}
}

export async function runUserCode(
	code: string,
	steps: Step[],
	width = 360,
	theme: "light" | "dark" = "light",
): Promise<RunResult> {
	const id = ++mockRunId;
	const plainSteps = JSON.parse(JSON.stringify(steps)) as Step[];

	let worker: Worker;
	try {
		worker = new Worker(new URL("./playground-worker.ts", import.meta.url), { type: "module" });
	} catch {
		return runUserCodeInline(code, plainSteps, width, theme);
	}

	return new Promise((resolve) => {
		const fallback = () => {
			worker.terminate();
			void runUserCodeInline(code, plainSteps, width, theme).then(resolve);
		};

		const timeout = setTimeout(fallback, 2000);

		worker.onmessage = (event: MessageEvent<RunResult & { id: number }>) => {
			if (event.data.id !== id) return;

			clearTimeout(timeout);
			worker.terminate();

			resolve({ svg: event.data.svg, logs: event.data.logs, error: event.data.error });
		};

		worker.onerror = () => {
			clearTimeout(timeout);
			fallback();
		};

		try {
			worker.postMessage({ id, code, steps: plainSteps, width, theme });
		} catch {
			clearTimeout(timeout);
			fallback();
		}
	});
}

export interface LiveSession {
	stop(): void;
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic bot shape patched at runtime
type LiveBot = any;

export async function startLive(
	code: string,
	token: string,
	onMsg: (m: ChatMessage) => void,
	onLog: (l: LogLine) => void,
): Promise<LiveSession> {
	const js = transform(code, { transforms: ["typescript", "imports"], filePath: "playground.ts" }).code;

	let captured: LiveBot = null;
	let realStart: () => Promise<void> = async () => {};

	const tame = (b: LiveBot): LiveBot => {
		captured = b;
		realStart = b.start.bind(b);

		b.start = async () => {};
		return b;
	};

	class PatchedBot extends (yaebal.Bot as new (t: string, o?: object) => LiveBot) {
		constructor(t?: string, o: object = {}) {
			super(t || token, o);
			tame(this);
		}
	}
	
	const patched = {
		...yaebal,
		Bot: PatchedBot,
		createBot: (t?: string, o: object = {}) => tame(yaebal.createBot(t || token, o)),
	};

	const MODULES: Record<string, unknown> = {
		yaebal: patched,
		"@yaebal/core": patched,
		"@yaebal/fmt": yaebal,
		"@yaebal/keyboard": yaebal,
		"@yaebal/test": ytest,
		"@yaebal/preview": ypreview,
	};

	const require = (name: string): unknown => {
		const m = MODULES[name];
		if (!m) throw new Error(`cannot import "${name}" in the playground`);

		return m;
	};

	const proc = { env: { BOT_TOKEN: token } as Record<string, string>, argv: [] as string[] };
	const sandboxConsole = {
		log: (...a: unknown[]) => onLog({ level: "log", text: fmt(a) }),
		info: (...a: unknown[]) => onLog({ level: "log", text: fmt(a) }),
		debug: (...a: unknown[]) => onLog({ level: "log", text: fmt(a) }),
		warn: (...a: unknown[]) => onLog({ level: "warn", text: fmt(a) }),
		error: (...a: unknown[]) => onLog({ level: "error", text: fmt(a) }),
	};

	const mod = { exports: {} };
	const fn = new Function("require", "console", "process", "exports", "module", js);

	await fn(require, sandboxConsole, proc, mod.exports, mod);
	if (!captured) throw new Error("no bot created — make one with new Bot(...) or createBot(...)");

	const bot = captured;
	const orig = bot.handleUpdate.bind(bot);

	bot.handleUpdate = async (u: { message?: { text?: string }; callback_query?: { data?: string } }) => {
		const text = u?.message?.text ?? u?.callback_query?.data;
		if (text != null) onMsg({ from: "user", text: String(text), status: "read" });

		return orig(u);
	};

	bot.api.before((method: string, params: Record<string, unknown> | undefined) => {
		if (method !== "getUpdates" && method !== "getMe") {
			const m = mapCall({ method, params, at: Date.now() });
			if (m) onMsg({ from: "bot", name: "bot", ...m });
		}

		return params;
	});

	const me = await bot.api.getMe();
	
	onLog({ level: "log", text: `@${me.username ?? "bot"} is live — message it on telegram` });
	void realStart().catch((error: unknown) => {
		onLog({ level: "error", text: `polling stopped: ${error instanceof Error ? error.message : String(error)}` });
	});

	return { stop: () => bot.stop() };
}
