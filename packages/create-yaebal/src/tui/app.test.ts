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

// step order: name → template → runtime → pm → plugins → deploy → ai → review.
// template comes before runtime/pm/plugins/deploy so the plugin path can skip
// all four of them cleanly (see `shouldSkip` in app.ts); the ai step applies
// to every template, plugin packages included.

test("tui: full flow resolves the chosen selections", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("testbot");
	// name → template → runtime → pm → plugins → deploy → ai → review → commit
	for (let i = 0; i < 8; i++) await h.press(ENTER);

	const result = await pending;
	assert.ok(result, "wizard should resolve with selections");
	assert.equal(result?.name, "testbot");
	assert.ok(["node", "bun", "deno"].includes(result?.runtime ?? ""));
	assert.ok(result?.plugins.includes("session"));
	assert.equal(result?.deploy, "none");
	assert.deepEqual(result?.ai, []); // default: no agents selected
	assert.equal(result?.ci, false);
});

test("tui: navigation, toggles and a plugin selection stick", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("navbot");
	await h.press(ENTER); // name → template
	await h.press(ENTER); // template → runtime (accept "minimal")
	await h.press(DOWN); // move the runtime cursor
	await h.press(ENTER); // runtime → pm
	await h.press(ENTER); // pm → plugins
	await h.press(DOWN); // move to 2nd plugin
	await h.press(SPACE); // toggle it
	await h.press(ENTER); // plugins → deploy
	await h.press(ENTER); // deploy → ai (accept "none")
	await h.press(ENTER); // ai → review (no agents)
	await h.press(ENTER); // create (cursor defaults to "create project")

	const result = await pending;
	assert.ok(result);
	assert.equal(result?.name, "navbot");
	// 2nd plugin (i18n) isn't in the default set, so toggling it adds it
	assert.ok(result?.plugins.includes("i18n"));
	assert.ok(["node", "bun", "deno"].includes(result?.runtime ?? ""));
});

test("tui: a deploy target pick sticks, and the ci toggle sticks", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("deploybot");
	await h.press(ENTER); // name → template
	await h.press(ENTER); // template → runtime
	await h.press(ENTER); // runtime → pm
	await h.press(ENTER); // pm → plugins
	await h.press(ENTER); // plugins → deploy
	await h.press(DOWN); // move off "none" to "docker"
	await h.press(ENTER); // deploy → ai
	await h.press(ENTER); // ai → review (cursor starts on "create project")
	await h.press(DOWN); // create → git
	await h.press(DOWN); // git → install
	await h.press(DOWN); // install → ci
	await h.press(SPACE); // toggle ci on
	await h.press(DOWN); // ci → create
	await h.press(ENTER); // create

	const result = await pending;
	assert.ok(result);
	assert.equal(result?.deploy, "docker");
	assert.equal(result?.ci, true);
});

test("tui: plugin template skips runtime, plugins and deploy", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs(["--template", "plugin"]), {
		input: h.input,
		output: h.output,
		rows: 30,
		cols: 80,
	});

	await h.type("plugbot");
	await h.press(ENTER); // name → pm (template locked; runtime skipped for the plugin template)
	await h.press(ENTER); // pm → ai (plugins/deploy skipped for the plugin template)
	await h.press(ENTER); // ai → review
	await h.press(ENTER); // create

	const result = await pending;
	assert.ok(result);
	assert.equal(result?.template, "plugin");
	assert.deepEqual(result?.plugins, []);
	assert.equal(result?.deploy, "none");
});

test("tui: an ai agent selection sticks", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 30, cols: 80 });

	await h.type("aibot");
	await h.press(ENTER); // name → template
	await h.press(ENTER); // template → runtime
	await h.press(ENTER); // runtime → pm
	await h.press(ENTER); // pm → plugins
	await h.press(ENTER); // plugins → deploy
	await h.press(ENTER); // deploy → ai
	await h.press(SPACE); // toggle the 1st agent (claude)
	await h.press(DOWN); // move to the 2nd agent (cursor)
	await h.press(SPACE); // toggle it
	await h.press(ENTER); // ai → review
	await h.press(ENTER); // create

	const result = await pending;
	assert.ok(result);
	assert.deepEqual(result?.ai, ["claude", "cursor"]);
});

test("tui: --ai locks and skips the ai step", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs(["--ai", "agents-md"]), {
		input: h.input,
		output: h.output,
		rows: 30,
		cols: 80,
	});

	await h.type("lockedbot");
	// name → template → runtime → pm → plugins → deploy → review (ai locked) → commit
	for (let i = 0; i < 7; i++) await h.press(ENTER);

	const result = await pending;
	assert.ok(result);
	assert.deepEqual(result?.ai, ["agents-md"]);
});

test("tui: renders a centred card with the current step", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 24, cols: 80 });
	await h.press(""); // let the first frame flush
	const f = h.frame();
	assert.match(f, /create-yaebal/);
	assert.match(f, /what should we call your bot project\?/);
	await h.press(CTRL_C);
	await pending;
});

test("tui: ctrl-c on the first step cancels", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), { input: h.input, output: h.output, rows: 24, cols: 80 });
	await h.press(CTRL_C);
	assert.equal(await pending, undefined);
});

test("tui: repaints on a terminal resize", { timeout: 5000 }, async () => {
	const h = harness();
	const pending = runTui(parseArgs([]), {
		input: h.input,
		output: h.output,
		rows: 24,
		cols: 80,
	});
	await h.press(""); // flush the first frame
	const before = h.frame().length;

	(h.output as unknown as PassThrough).emit("resize");
	await new Promise((r) => setImmediate(r));

	assert.ok(h.frame().length > before, "a resize should trigger another repaint");
	await h.press(CTRL_C);
	await pending;
});
