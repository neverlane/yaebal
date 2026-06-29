import { renderChat } from "@yaebal/preview";
import { transform } from "sucrase";
import * as yaebal from "yaebal";
import * as ypreview from "@yaebal/preview";
import * as ytest from "@yaebal/test";

import { type Step, feedSteps } from "./playground";

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

type AnyBot = Parameters<typeof feedSteps>[0];

self.onmessage = async (
	event: MessageEvent<{
		id: number;
		code: string;
		steps: Step[];
		width: number;
		theme: "light" | "dark";
	}>,
) => {
	const { id, code, steps, width, theme } = event.data;
	const logs: { level: "log" | "warn" | "error"; text: string }[] = [];
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
		self.postMessage({ id, svg: "", logs, error: `compile: ${e instanceof Error ? e.message : String(e)}` });
		return;
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
		self.postMessage({ id, svg: "", logs, error: `runtime: ${e instanceof Error ? e.message : String(e)}` });
		return;
	}

	if (!captured) {
		self.postMessage({ id, svg: "", logs, error: "no bot created — make one with new Bot(...) or createBot(...)" });
		return;
	}

	try {
		const convo = await feedSteps(captured, calls, steps);
		self.postMessage({ id, svg: renderChat(convo, { theme, width: Math.max(280, width) }), logs });
	} catch (e) {
		self.postMessage({ id, svg: "", logs, error: `runtime: ${e instanceof Error ? e.message : String(e)}` });
	}
};
