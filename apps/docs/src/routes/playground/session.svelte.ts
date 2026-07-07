/**
 * playground app state: projects, tokens, settings, mock steps and the run
 * pipeline (mock worker runs + live polling). window layout lives separately in
 * {@link ./window-manager.svelte.ts}; svelte effects that tie the two to
 * persistence stay in +page.svelte.
 */
import { base } from "$app/paths";

import { EXAMPLES } from "$lib/examples";
import {
	SETTLE_MS,
	type Step,
	type TimedMessage,
	formatSteps,
	parseSteps,
} from "$lib/playground";
import {
	type LiveSession,
	type LiveSettings,
	type LogLine,
	runUserCode,
	startLive,
} from "$lib/playground-run";
import {
	type Project,
	type Token,
	clearTokens,
	loadActiveToken,
	loadProjects,
	loadTokens,
	newProject,
	newToken,
	saveActiveToken,
	saveProjects,
	saveTokens,
} from "$lib/playground-store";
import { decodeShare, encodeShare } from "$lib/playground-share";
import type { ChatMessage } from "@yaebal/preview";

const EMPTY = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hi"));

bot.start();`;

const SETTINGS_KEY = "yaebal.pg.settings";

export class PlaygroundSession {
	readonly theme = "dark" as const;

	projects = $state<Project[]>([]);
	activeId = $state("");
	code = $state("");
	editingProjectId = $state("");
	editingProjectName = $state("");

	tokens = $state<Token[]>([]);
	activeTokenId = $state("");
	showSettings = $state(false);
	newLabel = $state("");
	newTok = $state("");
	apiRoot = $state("");
	proxyUrl = $state("");
	corsProxy = $state(false);
	autoRun = $state(true);
	settingsReady = $state(false);

	mode = $state<"mock" | "live">("mock");
	steps = $state<Step[]>([]);
	stepsText = $state("");
	svg = $state("");
	convo = $state<TimedMessage[]>([]);
	logs = $state<LogLine[]>([]);
	error = $state("");
	msg = $state("");
	busy = $state(false);
	copied = $state(false);

	live = $state<LiveSession | null>(null);
	liveMsgs = $state<ChatMessage[]>([]);

	/** set by the result pane; mock renders are sized to the visible chat. */
	chatEl: HTMLElement | undefined;
	/** stamped by runMock so the auto-run effect skips code it already ran. */
	lastRunCode = "";

	private importedExampleUrl = "";

	readonly settleMs = SETTLE_MS;

	get activeTokenLabel(): string {
		return this.tokens.find((t) => t.id === this.activeTokenId)?.label ?? "mock";
	}

	private chatW(): number {
		return Math.round(this.chatEl?.clientWidth || 360);
	}

	// --- boot ---

	/** load persisted state; returns whether a `?ex=` example was imported. */
	init(url: URL): boolean {
		this.projects = loadProjects();
		this.tokens = loadTokens();
		this.activeTokenId = loadActiveToken();
		this.loadSettings();

		const imported = this.importExampleFromUrl(url);
		const ex = EXAMPLES["getting-started"];

		if (!imported && !this.projects.length && ex) {
			this.projects = [newProject(ex.title, ex.code, ex.steps)];
			saveProjects(this.projects);
		}

		const first = this.projects.find((p) => p.id === this.activeId) ?? this.projects[0];
		this.activeId = first?.id ?? "";
		this.code = first?.code ?? ex?.code ?? "";

		const shared = url.searchParams.get("code");
		if (shared) {
			void decodeShare(shared)
				.then((decoded) => {
					this.code = decoded;
				})
				.catch(() => {
					/* malformed link — keep the example */
				});
		}

		this.setSteps(first?.steps ?? ex?.steps ?? []);
		return imported;
	}

	importExampleFromUrl(url: URL, runAfterImport = false): boolean {
		const exId = url.searchParams.get("ex");
		if (!exId) return false;

		const key = url.href;
		if (this.importedExampleUrl === key) return false;

		const ex = EXAMPLES[exId];
		if (!ex) return false;

		this.importedExampleUrl = key;

		const project = newProject(ex.title, ex.code, ex.steps);
		this.projects = [...this.projects, project];
		saveProjects(this.projects);

		this.activeId = project.id;
		this.code = project.code;
		this.setSteps(project.steps ?? []);

		if (runAfterImport && this.mode === "mock") this.runMock();
		return true;
	}

	// --- mock steps ---

	setSteps(value: Step[]) {
		this.steps = value;
		this.stepsText = formatSteps(value);
	}

	applyState() {
		this.setSteps(parseSteps(this.stepsText));
		if (this.mode === "mock") this.runMock();
	}

	clearState() {
		this.setSteps([]);
		if (this.mode === "mock") this.runMock();
	}

	send() {
		const t = this.msg.trim();
		if (!t || this.mode !== "mock") return;

		this.setSteps([...this.steps, { user: t }]);
		this.msg = "";

		this.runMock();
	}

	// --- running ---

	async runMock() {
		this.busy = true;
		this.lastRunCode = this.code;

		const res = await runUserCode(this.code, this.steps, this.chatW(), this.theme);

		this.svg = res.svg;
		this.convo = res.convo;
		this.logs = res.logs;
		this.error = res.error ?? "";
		this.busy = false;
	}

	run() {
		if (this.mode === "mock") this.runMock();
		else this.toggleLive();
	}

	async toggleLive() {
		if (this.live) {
			this.live.stop();
			this.live = null;
			this.logs = [...this.logs, { level: "log", text: "stopped." }];

			return;
		}

		const tok = this.tokens.find((t) => t.id === this.activeTokenId);
		if (!tok) {
			this.error = "select a bot token first";
			return;
		}

		this.error = "";
		this.liveMsgs = [];
		this.svg = "";
		this.convo = [];
		this.logs = [];

		try {
			const liveSettings: LiveSettings = {
				apiRoot: this.apiRoot.trim() || undefined,
				proxyUrl: this.proxyUrl.trim() || undefined,
				corsProxy: this.corsProxy,
			};

			this.live = await startLive(
				this.code,
				tok.token,
				(m) => {
					this.liveMsgs = [...this.liveMsgs, m];
				},
				(l) => {
					this.logs = [...this.logs, l];
				},
				liveSettings,
			);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		}
	}

	// --- projects ---

	addProject() {
		const p = newProject("untitled", EMPTY, []);
		this.projects = [...this.projects, p];

		saveProjects(this.projects);
		this.switchProject(p.id);
	}

	importExample(id: string) {
		const ex = EXAMPLES[id];
		if (!ex) return;

		const p = newProject(ex.title, ex.code, ex.steps);
		this.projects = [...this.projects, p];

		saveProjects(this.projects);
		this.switchProject(p.id);
	}

	switchProject(id: string) {
		const p = this.projects.find((x) => x.id === id);
		if (!p) return;

		this.activeId = id;
		this.code = p.code;
		this.setSteps(p.steps ?? []);

		if (this.mode === "mock") this.runMock();
	}

	startRename(p: Project) {
		this.editingProjectId = p.id;
		this.editingProjectName = p.name;
	}

	finishRename() {
		const p = this.projects.find((x) => x.id === this.editingProjectId);
		const name = this.editingProjectName.trim();

		if (p && name) {
			p.name = name;
			this.projects = [...this.projects];
			saveProjects(this.projects);
		}

		this.editingProjectId = "";
		this.editingProjectName = "";
	}

	cancelRename() {
		this.editingProjectId = "";
		this.editingProjectName = "";
	}

	deleteProject(id: string) {
		this.projects = this.projects.filter((p) => p.id !== id);
		saveProjects(this.projects);

		if (this.activeId === id) this.switchProject(this.projects[0]?.id ?? "");
	}

	/** persist the active project when code or steps changed (driven by a page effect). */
	syncActiveProject() {
		const p = this.projects.find((x) => x.id === this.activeId);

		if (p && (p.code !== this.code || JSON.stringify(p.steps ?? []) !== JSON.stringify(this.steps))) {
			p.code = this.code;
			p.steps = [...this.steps];
			saveProjects(this.projects);
		}
	}

	// --- tokens ---

	addToken() {
		if (!this.newTok.trim()) return;

		const t = newToken(this.newLabel.trim() || "bot", this.newTok.trim());
		this.tokens = [...this.tokens, t];
		saveTokens(this.tokens);

		this.activeTokenId = t.id;
		saveActiveToken(t.id);

		this.newLabel = "";
		this.newTok = "";
	}

	removeToken(id: string) {
		this.tokens = this.tokens.filter((t) => t.id !== id);
		saveTokens(this.tokens);

		if (this.activeTokenId === id) this.pickToken("");
	}

	removeAllTokens() {
		this.tokens = [];
		this.activeTokenId = "";
		clearTokens();
	}

	pickToken(id: string) {
		this.activeTokenId = id;
		saveActiveToken(id);
	}

	// --- settings ---

	loadSettings() {
		try {
			const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
			this.apiRoot = typeof settings.apiRoot === "string" ? settings.apiRoot : "";
			this.proxyUrl = typeof settings.proxyUrl === "string" ? settings.proxyUrl : "";
			this.corsProxy = Boolean(settings.corsProxy);
			this.autoRun = settings.autoRun !== false;
		} catch {
			this.apiRoot = "";
			this.proxyUrl = "";
			this.corsProxy = false;
			this.autoRun = true;
		}

		this.settingsReady = true;
	}

	saveSettings() {
		localStorage.setItem(
			SETTINGS_KEY,
			JSON.stringify({
				apiRoot: this.apiRoot,
				proxyUrl: this.proxyUrl,
				corsProxy: this.corsProxy,
				autoRun: this.autoRun,
			}),
		);
	}

	// --- share ---

	async share() {
		const packed = await encodeShare(this.code);
		const url = `${location.origin}${base}/playground?code=${encodeURIComponent(packed)}`;

		if (url.length > 7000) {
			this.error = "share link is too large — copy the code instead";
			return;
		}

		try {
			await navigator.clipboard.writeText(url);
			this.copied = true;
			setTimeout(() => {
				this.copied = false;
			}, 1400);
		} catch {
			/* clipboard blocked */
		}
	}
}
