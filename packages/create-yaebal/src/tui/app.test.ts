import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { parseArgs } from "../args.js";
import { stripAnsi } from "./ansi.js";
import { runTui } from "./app.js";

/**
 * the wizard is pure ansi/readline, so it tests on plain node — no native core,
 * no skips. we drive it through a fake stdin (writing raw key sequences) and
 * read frames back from a fake stdout.
 */
function harness() {
	const input = new PassThrough();
	const output = new PassThrough();
	let buf = "";
	output.on("data", (d) => {
		buf += d.toString();
	});
	const tick = () => new Promise((r) => setImmediate(r));
	return {
		input: input as unknown as NodeJS.ReadStream,
		output: output as unknown as NodeJS.WriteStream,
		frame: () => stripAnsi(buf),
		async press(seq: string) {
			input.write(seq);
			await tick();
		},
		async type(s: string) {
			for (const ch of s) await this.press(ch);
		},
	};
}

const ENTER = "\r";
const DOWN = "\x1b[B";
const SPACE = " ";
const CTRL_C = "\x03";

test("tui: full flow resolves the chosen selections", async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("testbot");
	// name → runtime → pm → template → plugins → review → commit
	for (let i = 0; i < 6; i++) await h.press(ENTER);

	const result = await pending;
	assert.ok(result, "wizard should resolve with selections");
	assert.equal(result?.name, "testbot");
	assert.ok(["node", "bun", "deno"].includes(result?.runtime ?? ""));
	assert.ok(result?.plugins.includes("session"));
});

test("tui: navigation, toggles and a plugin selection stick", async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("navbot");
	await h.press(ENTER); // → runtime
	await h.press(DOWN); // move the runtime cursor
	await h.press(ENTER); // → pm
	await h.press(ENTER); // → template
	await h.press(ENTER); // → plugins
	await h.press(DOWN); // move to 2nd plugin
	await h.press(SPACE); // toggle it
	await h.press(ENTER); // → review
	await h.press(ENTER); // create (cursor defaults to "create project")

	const result = await pending;
	assert.ok(result);
	assert.equal(result?.name, "navbot");
	// 2nd plugin (i18n) isn't in the default set, so toggling it adds it
	assert.ok(result?.plugins.includes("i18n"));
	assert.ok(["node", "bun", "deno"].includes(result?.runtime ?? ""));
});

test("tui: renders a centred card with the current step", async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 24, cols: 80 });
	await h.press(""); // let the first frame flush
	const f = h.frame();
	assert.match(f, /create-yaebal/);
	assert.match(f, /what should we call your bot project\?/);
	await h.press(CTRL_C);
	await pending;
});

test("tui: ctrl-c on the first step cancels", async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 24, cols: 80 });
	await h.press(CTRL_C);
	assert.equal(await pending, undefined);
});
