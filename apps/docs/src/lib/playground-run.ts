/**
 * playground run orchestration. mock runs go to a web worker (with an inline fallback
 * when workers are unavailable or time out); live mode runs in the page against a real
 * token. the sandbox itself — compiler, module registry, bot capture — lives in
 * `playground-sandbox.ts` and is loaded on demand so doc pages embedding `Try` blocks
 * don't pay for the full plugin registry.
 */
import type { ChatMessage } from "@yaebal/preview";

import { type Step, mapCall } from "./playground";
import type { LogLine, RunResult } from "./playground-sandbox";

export type { LogLine, RunResult } from "./playground-sandbox";

let mockRunId = 0;

export async function runUserCode(
	code: string,
	steps: Step[],
	width = 360,
	theme: "light" | "dark" = "light",
): Promise<RunResult> {
	const id = ++mockRunId;
	const plainSteps = JSON.parse(JSON.stringify(steps)) as Step[];

	const inline = async (): Promise<RunResult> =>
		(await import("./playground-sandbox")).runMockScenario(code, plainSteps, width, theme);

	let worker: Worker;
	try {
		worker = new Worker(new URL("./playground-worker.ts", import.meta.url), { type: "module" });
	} catch {
		return inline();
	}

	return new Promise((resolve) => {
		const fallback = () => {
			worker.terminate();
			void inline().then(resolve);
		};

		const timeout = setTimeout(fallback, 2000);

		worker.onmessage = (event: MessageEvent<RunResult & { id: number }>) => {
			if (event.data.id !== id) return;

			clearTimeout(timeout);
			worker.terminate();

			resolve({
				svg: event.data.svg,
				logs: event.data.logs,
				convo: event.data.convo ?? [],
				error: event.data.error,
			});
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

export interface LiveSettings {
	apiRoot?: string;
	proxyUrl?: string;
	corsProxy?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic bot shape patched at runtime
type LiveBot = any;

export async function startLive(
	code: string,
	token: string,
	onMsg: (m: ChatMessage) => void,
	onLog: (l: LogLine) => void,
	settings: LiveSettings = {},
): Promise<LiveSession> {
	const sandbox = await import("./playground-sandbox");
	const js = sandbox.compile(code);

	const configuredApiRoot =
		settings.corsProxy && settings.proxyUrl ? settings.proxyUrl : settings.apiRoot;
	const withSettings = (o: object = {}) => ({
		...(configuredApiRoot ? { apiRoot: configuredApiRoot } : {}),
		...o,
	});

	const { patched, captured } = sandbox.patchBotModule(token, withSettings);

	await sandbox.execute(js, {
		require: sandbox.makeRequire({ yaebal: patched, "@yaebal/core": patched }),
		console: sandbox.sandboxConsole(onLog),
		env: {
			BOT_TOKEN: token,
			...(configuredApiRoot ? { YAEBAL_API_ROOT: configuredApiRoot } : {}),
			...(settings.proxyUrl ? { YAEBAL_PROXY_URL: settings.proxyUrl } : {}),
		},
	});
	if (!captured.bot) throw new Error("no bot created — make one with new Bot(...) or createBot(...)");

	const bot = captured.bot as LiveBot;
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
	void captured.realStart().catch((error: unknown) => {
		onLog({ level: "error", text: `polling stopped: ${error instanceof Error ? error.message : String(error)}` });
	});

	return { stop: () => bot.stop() };
}
