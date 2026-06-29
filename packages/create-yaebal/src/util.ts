/**
 * small runtime/environment helpers shared by every front-end: detection of
 * the current runtime and package manager, tty checks, project-name validation
 * and tiny process spawners for `git init` / dependency install.
 */

import { spawn } from "node:child_process";
import process from "node:process";
import type { PackageManager, Runtime } from "./catalog.js";

/** detect which runtime is executing the scaffolder right now. */
export function detectRuntime(): Runtime {
	const g = globalThis as { Bun?: unknown; Deno?: unknown };

	if (typeof g.Bun !== "undefined") return "bun";
	if (typeof g.Deno !== "undefined") return "deno";

	return "node";
}

/** detect the package manager from `npm_config_user_agent` (set by every pm). */
export function detectPackageManager(): PackageManager | undefined {
	const ua = process.env.npm_config_user_agent ?? "";

	if (ua.startsWith("pnpm")) return "pnpm";
	if (ua.startsWith("yarn")) return "yarn";
	if (ua.startsWith("bun")) return "bun";
	if (ua.startsWith("npm")) return "npm";

	if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") return "bun";
	if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") return "deno";

	return undefined;
}

/** true when both stdin and stdout are real ttys (prompts/tui make sense). */
export function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * whether the rich ansi front-end can run. it needs an interactive tty, a
 * terminal that isn't a dumb one, and the user not opting out via env. callers
 * still fall back gracefully to the plain prompts otherwise.
 */
export function supportsTui(): boolean {
	if (!isInteractive()) return false;

	if (process.env.CI) return false;
	if (process.env.TERM === "dumb") return false;
	if (process.env.NO_TUI || process.env.YAEBAL_NO_TUI) return false;

	return true;
}

/** npm package-name rules, scoped down to what a folder can be called. */
export function validateProjectName(raw: string): string | undefined {
	const name = raw.trim();

	if (!name) return "project name is required";

	if (name === "." || name === "..") return "pick a real directory name";
	if (name.length > 214) return "name is too long (max 214 chars)";

	if (!/^[a-z0-9._-]+$/.test(name)) return "use lowercase letters, digits, '.', '_' or '-' only";
	if (/^[._]/.test(name)) return "name can't start with '.' or '_'";

	return undefined;
}

/** spawn a command, inheriting stdio, resolving to its exit code. */
export function exec(cmd: string, args: string[], cwd: string): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

		child.on("error", () => resolve(1));
		child.on("close", (code) => resolve(code ?? 0));
	});
}

/** `git init` + an initial commit; best-effort, never throws. */
export async function gitInit(cwd: string): Promise<boolean> {
	const init = await exec("git", ["init", "-q"], cwd);
	if (init !== 0) return false;

	await exec("git", ["add", "-A"], cwd);
	await exec("git", ["commit", "-q", "-m", "init: scaffold with create-yaebal"], cwd);

	return true;
}

/** run the package manager's install in `cwd`. deno is a no-op (no lockfile). */
export async function installDeps(pm: PackageManager, cwd: string): Promise<boolean> {
	if (pm === "deno") {
		const code = await exec("deno", ["cache", "src/index.ts"], cwd);
		return code === 0;
	}

	const code = await exec(pm, ["install"], cwd);
	return code === 0;
}
