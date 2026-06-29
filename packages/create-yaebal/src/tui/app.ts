/**
 * the wizard — a centred, keyboard-driven card rendered with pure ansi (see
 * `./ansi.ts`). no native deps: it runs on node, bun and deno wherever there's
 * a tty. a tiny step state-machine drives a full repaint on every keystroke,
 * which at this size is instant and flicker-free on the alternate screen.
 *
 * the renderer is injectable (input/output/size) so tests can drive it with a
 * fake stdin and read frames back from a fake stdout.
 */

import process from "node:process";
import type { ParsedArgs } from "../args.js";
import { type Choice, PACKAGE_MANAGERS, PLUGINS, RUNTIMES, TEMPLATES } from "../catalog.js";
import { defaults, type Selections, sanitizePlugins } from "../config.js";
import { validateProjectName } from "../util.js";
import { fg, type KeyEvent, moveTo, onKeypress, padTo, screen, style, vlen } from "./ansi.js";
import { CARD_WIDTH, TAGLINE, TITLE, theme } from "./theme.js";

type StepId = "name" | "runtime" | "pm" | "template" | "plugins" | "review";
const STEPS: StepId[] = ["name", "runtime", "pm", "template", "plugins", "review"];

/** inner text width: card minus borders (2) minus side padding (2). */
const TW = CARD_WIDTH - 4;

interface State {
	step: number;
	name: string;
	nameError?: string;
	runtimeIdx: number;
	pmIdx: number;
	templateIdx: number;
	pluginCursor: number;
	selected: Set<string>;
	git: boolean;
	install: boolean;
	reviewCursor: number; // 0=git 1=install 2=create
}

function indexOfValue<T extends { value: string }>(arr: T[], v: string): number {
	const i = arr.findIndex((x) => x.value === v);
	return i === -1 ? 0 : i;
}

export interface TuiIO {
	input?: NodeJS.ReadStream;
	output?: NodeJS.WriteStream;
	rows?: number;
	cols?: number;
}

interface Seg {
	t: string;
	fg?: string;
}

/** run the wizard. resolves with selections, or `undefined` if cancelled. */
export async function runTui(args: ParsedArgs, io: TuiIO = {}): Promise<Selections | undefined> {
	const d = defaults(args);
	const input = io.input ?? process.stdin;
	const output = io.output ?? process.stdout;
	const cols = () => io.cols ?? (output as Partial<NodeJS.WriteStream>).columns ?? 80;
	const rows = () => io.rows ?? (output as Partial<NodeJS.WriteStream>).rows ?? 24;
	const isTty = Boolean((output as Partial<NodeJS.WriteStream>).isTTY);

	const state: State = {
		step: 0,
		name: args.name ?? "",
		runtimeIdx: indexOfValue(RUNTIMES, d.runtime),
		pmIdx: indexOfValue(PACKAGE_MANAGERS, d.packageManager),
		templateIdx: indexOfValue(TEMPLATES, d.template),
		pluginCursor: 0,
		selected: new Set(d.plugins),
		git: d.git,
		install: d.install,
		reviewCursor: 2,
	};

	// steps the user already pinned via flags are skipped during navigation.
	const locked: Partial<Record<StepId, true>> = {};
	if (args.runtime) locked.runtime = true;
	if (args.packageManager) locked.pm = true;
	if (args.template) locked.template = true;
	if (args.plugins) locked.plugins = true;

	const write = (s: string) => output.write(s);

	// ── styling shortcuts ────────────────────────────────────────────────────
	const accent = fg(theme.accent);
	const dim = fg(theme.dim);
	const text = fg(theme.text);
	const border = fg(theme.border);

	function clip(s: string, w: number): string {
		return s.length > w ? s.slice(0, w) : s;
	}

	/** a single row: per-segment fg, a full-width background when active. */
	function rowLine(active: boolean, segs: Seg[]): string {
		const bg = active ? theme.cursorBg : undefined;
		let remaining = TW;
		let out = "";
		for (const s of segs) {
			if (remaining <= 0) break;
			const t = clip(s.t, remaining);
			remaining -= t.length;
			out += style({ fg: s.fg, bg })(t);
		}
		if (remaining > 0) out += style({ bg })(" ".repeat(remaining));
		return out;
	}

	// ── content builders (return inner lines) ────────────────────────────────
	function headerLines(): string[] {
		let crumbs = "";
		STEPS.forEach((_, i) => {
			const color =
				i < state.step ? theme.accent : i === state.step ? theme.accentBright : theme.border;
			crumbs += fg(color)(i === state.step ? "● " : "○ ");
		});
		crumbs += dim(` ${state.step + 1}/${STEPS.length}  ${STEPS[state.step]}`);
		return [dim(TAGLINE), "", crumbs];
	}

	function inputBar(value: string): string {
		const inside = clip(` ${value}█`, TW);
		return style({ bg: theme.panel, fg: theme.text })(padTo(inside, TW));
	}

	function selectLines(choices: Choice<string>[], cursor: number): string[] {
		const lines: string[] = [];
		choices.forEach((ch, i) => {
			const active = i === cursor;
			lines.push(
				rowLine(active, [
					{ t: active ? "▶ " : "  ", fg: active ? theme.accentBright : theme.dim },
					{ t: ch.label, fg: active ? theme.accentBright : theme.text },
				]),
			);
			lines.push(rowLine(active, [{ t: `   ${ch.hint}`, fg: theme.dim }]));
		});
		return lines;
	}

	/** windowed slice of a long list, keeping the cursor visible. */
	function windowed(total: number, cursor: number, max: number): [number, number] {
		if (total <= max) return [0, total];
		let start = cursor - Math.floor(max / 2);
		if (start < 0) start = 0;
		if (start + max > total) start = total - max;
		return [start, start + max];
	}

	function pluginLines(): string[] {
		const lines: string[] = [accent(`plugins · ${state.selected.size} selected`), ""];
		const max = Math.max(6, rows() - 12);
		const [from, to] = windowed(PLUGINS.length, state.pluginCursor, max);
		if (from > 0) lines.push(dim("   ↑ more"));
		for (let i = from; i < to; i++) {
			const p = PLUGINS[i];
			if (!p) continue;
			const active = i === state.pluginCursor;
			const on = state.selected.has(p.id);
			lines.push(
				rowLine(active, [
					{ t: ` ${on ? "◉" : "◯"} `, fg: on ? theme.accent : theme.dim },
					{ t: p.recommended ? `${p.id} ★` : p.id, fg: active ? theme.text : theme.dim },
					{ t: `  ${p.hint}`, fg: theme.border },
				]),
			);
		}
		if (to < PLUGINS.length) lines.push(dim("   ↓ more"));
		return lines;
	}

	function reviewLines(): string[] {
		const sel = sanitizePlugins([...state.selected]);
		const kv = (k: string, v: string) => `${dim(`  ${k.padEnd(9)}`)} ${text(clip(v, TW - 12))}`;
		return [
			accent("review & create"),
			"",
			kv("name", state.name.trim() || "my-bot"),
			kv("runtime", RUNTIMES[state.runtimeIdx]?.label ?? "node.js"),
			kv("pkg mgr", PACKAGE_MANAGERS[state.pmIdx]?.label ?? "pnpm"),
			kv("template", TEMPLATES[state.templateIdx]?.label ?? "minimal"),
			kv("plugins", sel.length ? sel.join(", ") : "none"),
			"",
			rowLine(state.reviewCursor === 0, [
				{ t: ` ${state.git ? "◉" : "◯"} `, fg: state.git ? theme.accent : theme.dim },
				{ t: "git init", fg: theme.text },
				{ t: "  repo + first commit", fg: theme.border },
			]),
			rowLine(state.reviewCursor === 1, [
				{ t: ` ${state.install ? "◉" : "◯"} `, fg: state.install ? theme.accent : theme.dim },
				{ t: "install deps", fg: theme.text },
				{ t: "  run the package manager", fg: theme.border },
			]),
			rowLine(state.reviewCursor === 2, [
				{ t: " » ", fg: theme.accentBright },
				{ t: "create project", fg: state.reviewCursor === 2 ? theme.accentBright : theme.text },
			]),
		];
	}

	function bodyAndFooter(): { body: string[]; footer: string } {
		switch (STEPS[state.step]) {
			case "name":
				return {
					body: [
						accent("what should we call your bot project?"),
						"",
						inputBar(state.name),
						state.nameError
							? fg(theme.bad)(`✗ ${state.nameError}`)
							: dim("used as the folder & package name"),
					],
					footer: "type to edit · enter next · esc cancel",
				};
			case "runtime":
				return {
					body: [accent("which runtime?"), "", ...selectLines(RUNTIMES, state.runtimeIdx)],
					footer: "↑/↓ move · enter next · ← back · esc cancel",
				};
			case "pm":
				return {
					body: [
						accent("which package manager?"),
						"",
						...selectLines(PACKAGE_MANAGERS, state.pmIdx),
					],
					footer: "↑/↓ move · enter next · ← back · esc cancel",
				};
			case "template":
				return {
					body: [
						accent("pick a starter template"),
						"",
						...selectLines(TEMPLATES, state.templateIdx),
					],
					footer: "↑/↓ move · enter next · ← back · esc cancel",
				};
			case "plugins":
				return {
					body: pluginLines(),
					footer: "↑/↓ · space toggle · a/n all·none · enter next · ← back",
				};
			default:
				return {
					body: reviewLines(),
					footer: "↑/↓ · space toggle · enter create · ← back · esc cancel",
				};
		}
	}

	// ── framing & paint ──────────────────────────────────────────────────────
	function frame(content: string[]): string[] {
		const W = CARD_WIDTH;
		const out: string[] = [];
		const title = ` ${TITLE} `;
		const dashes = Math.max(0, W - 3 - vlen(title));
		out.push(`${border("╭─")}${accent(title)}${border(`${"─".repeat(dashes)}╮`)}`);
		const blank = `${border("│")}${" ".repeat(W - 2)}${border("│")}`;
		out.push(blank);
		for (const line of content) out.push(`${border("│")} ${padTo(line, W - 4)} ${border("│")}`);
		out.push(blank);
		out.push(border(`╰${"─".repeat(W - 2)}╯`));
		return out;
	}

	function render(): void {
		const { body, footer } = bodyAndFooter();
		// clip the footer so a long hint can never spill past the card border.
		const card = frame([...headerLines(), "", ...body, "", dim(clip(footer, TW))]);
		const top = Math.max(0, Math.floor((rows() - card.length) / 2));
		const left = Math.max(0, Math.floor((cols() - CARD_WIDTH) / 2));
		let out = screen.clear;
		card.forEach((line, i) => {
			out += moveTo(top + i + 1, left + 1) + line;
		});
		write(out);
	}

	// ── navigation + key handling ────────────────────────────────────────────
	return new Promise<Selections | undefined>((resolve) => {
		let done = false;
		let cleanup = () => {};

		const finish = (result: Selections | undefined) => {
			if (done) return;
			done = true;
			cleanup();
			if (isTty) write(screen.showCursor + screen.leave);
			resolve(result);
		};

		const commit = () =>
			finish({
				name: state.name.trim() || "my-bot",
				runtime: RUNTIMES[state.runtimeIdx]?.value ?? "node",
				packageManager: PACKAGE_MANAGERS[state.pmIdx]?.value ?? "pnpm",
				template: TEMPLATES[state.templateIdx]?.value ?? "minimal",
				plugins: sanitizePlugins([...state.selected]),
				git: state.git,
				install: state.install,
			});

		const nextStep = () => {
			let i = state.step + 1;
			while (i < STEPS.length && locked[STEPS[i] as StepId]) i++;
			if (i >= STEPS.length) return commit();
			state.step = i;
			render();
		};
		const prevStep = () => {
			let i = state.step - 1;
			while (i >= 0 && locked[STEPS[i] as StepId]) i--;
			if (i < 0) return;
			state.step = i;
			render();
		};

		const onKey = (key: KeyEvent) => {
			const step = STEPS[state.step];
			if (key.ctrl && key.name === "c") return finish(undefined);
			if (key.name === "escape") return state.step === 0 ? finish(undefined) : prevStep();
			const enter = key.name === "return" || key.name === "enter";

			if (step === "name") {
				if (enter) {
					const err = validateProjectName(state.name.trim());
					if (err) {
						state.nameError = err;
						return render();
					}
					state.name = state.name.trim();
					return nextStep();
				}
				if (key.name === "backspace") {
					state.name = state.name.slice(0, -1);
					state.nameError = undefined;
					return render();
				}
				if (key.sequence && key.sequence.length === 1 && key.sequence >= " " && !key.ctrl) {
					state.name += key.sequence;
					state.nameError = undefined;
					return render();
				}
				return;
			}

			if (key.name === "left") return prevStep();

			if (step === "runtime" || step === "pm" || step === "template") {
				const len =
					step === "runtime"
						? RUNTIMES.length
						: step === "pm"
							? PACKAGE_MANAGERS.length
							: TEMPLATES.length;
				const get = () =>
					step === "runtime" ? state.runtimeIdx : step === "pm" ? state.pmIdx : state.templateIdx;
				const set = (n: number) => {
					if (step === "runtime") state.runtimeIdx = n;
					else if (step === "pm") state.pmIdx = n;
					else state.templateIdx = n;
				};
				if (key.name === "up") set((get() - 1 + len) % len);
				else if (key.name === "down") set((get() + 1) % len);
				else if (enter) return nextStep();
				else return;
				return render();
			}

			if (step === "plugins") {
				if (key.name === "up")
					state.pluginCursor = (state.pluginCursor - 1 + PLUGINS.length) % PLUGINS.length;
				else if (key.name === "down")
					state.pluginCursor = (state.pluginCursor + 1) % PLUGINS.length;
				else if (key.name === "space") {
					const id = PLUGINS[state.pluginCursor]?.id;
					if (id) state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
				} else if (key.name === "a") for (const p of PLUGINS) state.selected.add(p.id);
				else if (key.name === "n") state.selected.clear();
				else if (enter) return nextStep();
				else return;
				return render();
			}

			// review
			if (key.name === "up") state.reviewCursor = (state.reviewCursor + 2) % 3;
			else if (key.name === "down") state.reviewCursor = (state.reviewCursor + 1) % 3;
			else if (key.name === "space" || enter) {
				if (state.reviewCursor === 0) state.git = !state.git;
				else if (state.reviewCursor === 1) state.install = !state.install;
				else return commit();
			} else return;
			return render();
		};

		cleanup = onKeypress(input, onKey);
		if (isTty) write(screen.enter + screen.hideCursor);
		render();
	});
}
