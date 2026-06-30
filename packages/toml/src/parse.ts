import { existsSync, readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { validateTomlConfig } from "./schema.js";
import type { TomlBotConfig, TomlConfigInput } from "./types.js";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isPathLike(input: string): boolean {
	const trimmed = input.trim();

	if (trimmed === "") return false;
	if (trimmed.includes("\n") || trimmed.includes("=") || trimmed.startsWith("[")) return false;
	if (existsSync(input)) return true;

	return trimmed.endsWith(".toml") || trimmed.endsWith(".tml");
}

function loadTomlSource(input: string): string {
	if (!isPathLike(input)) return input;

	try {
		return readFileSync(input, "utf8");
	} catch (error) {
		throw new Error(`failed to read toml config file "${input}": ${errorMessage(error)}`);
	}
}

/** parse a toml config from a file path, raw toml string, or parsed object. */
export function parseTomlConfig(input: TomlConfigInput): TomlBotConfig {
	if (typeof input !== "string") return validateTomlConfig(input);

	const source = loadTomlSource(input);
	let parsed: unknown;

	try {
		parsed = parse(source);
	} catch (error) {
		throw new Error(`failed to parse toml config: ${errorMessage(error)}`);
	}

	return validateTomlConfig(parsed);
}
