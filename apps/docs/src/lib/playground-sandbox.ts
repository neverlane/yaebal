/**
 * the shared sandbox behind every playground mode: compiles the snippet with sucrase,
 * hands it a CommonJS-style `require` over the module registry, captures the bot it
 * creates (patching `start()` so nothing long-polls), and — for mock runs — feeds the
 * recorded steps and renders the chat. the worker, the inline fallback and live mode
 * all run through here, so behavior can't drift between them.
 */
import { renderChat } from "@yaebal/preview";
import * as ytest from "@yaebal/test";
import { transform } from "sucrase";
import * as yaebal from "yaebal";

import type { BotOptions } from "yaebal";

import { SETTLE_MS, type Step, type TimedMessage, feedSteps } from "./playground";
import { PLUGIN_MODULES } from "./playground-modules";

export type LogLine = { level: "log" | "warn" | "error"; text: string };

export interface RunResult {
	svg: string;
	logs: LogLine[];
	/** the assembled conversation with virtual timestamps — for the reveal animation. */
	convo: TimedMessage[];
	error?: string;
}

type AnyBot = Parameters<typeof feedSteps>[0];

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const fmtArgs = (args: unknown[]): string =>
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

export function sandboxConsole(push: (line: LogLine) => void) {
	return {
		log: (...a: unknown[]) => push({ level: "log", text: fmtArgs(a) }),
		info: (...a: unknown[]) => push({ level: "log", text: fmtArgs(a) }),
		debug: (...a: unknown[]) => push({ level: "log", text: fmtArgs(a) }),
		warn: (...a: unknown[]) => push({ level: "warn", text: fmtArgs(a) }),
		error: (...a: unknown[]) => push({ level: "error", text: fmtArgs(a) }),
	};
}

export function compile(code: string): string {
	return transform(code, { transforms: ["typescript", "imports"], filePath: "playground.ts" })
		.code;
}

export interface CapturedBot {
	bot: AnyBot | null;
	realStart: () => Promise<void>;
}

/**
 * a `yaebal` module whose `Bot`/`createBot` remember the bot the snippet builds and
 * neuter `start()` (the real one is kept on `captured.realStart` for live mode).
 * `mergeOptions` decides how caller-forced options combine with the snippet's own.
 */
export function patchBotModule(
	token: string,
	mergeOptions: (userOptions: object) => BotOptions,
): { patched: Record<string, unknown>; captured: CapturedBot } {
	const captured: CapturedBot = { bot: null, realStart: async () => {} };

	const tame = (b: AnyBot): AnyBot => {
		captured.bot = b;

		const bot = b as unknown as { start: () => Promise<void> };
		captured.realStart = bot.start.bind(bot);
		bot.start = async () => {};

		return b;
	};

	class PatchedBot extends (yaebal.Bot as new (t: string, o?: object) => AnyBot) {
		constructor(t?: string, options: object = {}) {
			super(t || token, mergeOptions(options));
			tame(this as AnyBot);
		}
	}

	const createBot = (t?: string, options: object = {}) =>
		tame(yaebal.createBot(t || token, mergeOptions(options)));

	return { patched: { ...yaebal, Bot: PatchedBot, createBot }, captured };
}

export function makeRequire(extra: Record<string, unknown>): (name: string) => unknown {
	const modules: Record<string, unknown> = { ...PLUGIN_MODULES, ...extra };

	return (name: string): unknown => {
		const m = modules[name];
		if (!m)
			throw new Error(
				`cannot import "${name}" in the playground — available: ${Object.keys(modules).sort().join(", ")}`,
			);

		return m;
	};
}

export async function execute(
	js: string,
	opts: {
		require: (name: string) => unknown;
		console: ReturnType<typeof sandboxConsole>;
		env?: Record<string, string>;
	},
): Promise<void> {
	const mod = { exports: {} };
	const fn = new Function("require", "console", "process", "exports", "module", js);

	await fn(opts.require, opts.console, { env: opts.env ?? {}, argv: [] }, mod.exports, mod);
}

/**
 * compile + run a snippet against the mock api, replay `steps`, render the chat svg.
 *
 * runs under a @yaebal/test virtual clock, so `setTimeout`/`setInterval` in handlers
 * fire instantly in virtual time: due timers are flushed after every step, `wait:`
 * steps advance the clock explicitly, and trailing timers get a {@link SETTLE_MS}
 * settle window after the last step.
 */
export async function runMockScenario(
	code: string,
	steps: Step[],
	width = 360,
	theme: "light" | "dark" = "light",
): Promise<RunResult> {
	const logs: LogLine[] = [];

	let js: string;
	try {
		js = compile(code);
	} catch (e) {
		return { svg: "", logs, convo: [], error: `compile: ${errText(e)}` };
	}

	const { api, calls } = ytest.mockApi();
	const wire = {
		contextFactory: (_a: unknown, u: unknown, t: unknown) =>
			yaebal.richContext(api, u as never, t as never),
	};

	const { patched, captured } = patchBotModule("playground", (o) => ({ ...o, ...wire }));
	const require = makeRequire({ yaebal: patched, "@yaebal/core": patched });

	// real timer functions, snapshotted before the virtual clock replaces them —
	// the hang guard below must tick in real time even while the clock is installed
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;
	const clock = ytest.installTestClock();

	try {
		const run = execute(js, { require, console: sandboxConsole((l) => logs.push(l)) });

		// drain top-level awaits that sleep on timers (`await new Promise(r => setTimeout(r, …))`):
		// alternate microtask turns with clock advances until the snippet settles
		let settled = false;
		const tracked = run.then(
			() => {
				settled = true;
			},
			(e: unknown) => {
				settled = true;
				throw e;
			},
		);

		for (let i = 0; i < 25 && !settled; i++) {
			await Promise.resolve();
			await clock.advance(SETTLE_MS);
		}

		// a snippet awaiting something that never settles would hang the runner —
		// cap it with a short real-time deadline instead
		let guard!: ReturnType<typeof realSetTimeout>;
		const timedOut = await Promise.race([
			tracked.then(() => false),
			new Promise<true>((resolve) => {
				guard = realSetTimeout(() => resolve(true), 3000);
			}),
		]).finally(() => realClearTimeout(guard));

		if (timedOut) {
			return {
				svg: "",
				logs,
				convo: [],
				error: "runtime: code did not finish — a top-level await never settled",
			};
		}

		if (!captured.bot) {
			return {
				svg: "",
				logs,
				convo: [],
				error: "no bot created — make one with new Bot(...) or createBot(...)",
			};
		}

		const convo = await feedSteps(captured.bot, calls, steps, clock);
		return { svg: renderChat(convo, { theme, width: Math.max(280, width) }), convo, logs };
	} catch (e) {
		return { svg: "", logs, convo: [], error: `runtime: ${errText(e)}` };
	} finally {
		clock.restore();
	}
}
