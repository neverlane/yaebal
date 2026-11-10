import assert from "node:assert/strict";
import test from "node:test";
import { raw } from "./html.js";
import { lintHtml } from "./lint.js";

const rules = (html: string) => lintHtml(html).map((i) => i.rule);

test("a widget that stays inside the sandbox is clean", () => {
	const clean = `<style>.b{display:flex;color:var(--tg-theme-text-color)}</style>
<button class="b" onclick="go()">vote</button>
<svg><circle r="4"/></svg>
<script>const W=window.TelegramWidget;function go(){W.request("vote")}W.onEvent("publicDataChanged",draw)</script>`;
	assert.deepEqual(lintHtml(clean), []);
	assert.deepEqual(lintHtml(raw("")), []);
});

test("network, external scripts and resources are errors", () => {
	const issues = lintHtml(`<script src="https://x/a.js"></script>
<link rel="stylesheet" href="a.css">
<img src="https://cdn.example.com/cat.png">
<script>fetch("/api");new WebSocket("wss://x");import("./m.js")</script>`);
	assert.deepEqual(
		issues.map((i) => [i.rule, i.severity, i.line]),
		[
			["no-external-script", "error", 1],
			["no-external-resource", "error", 2],
			["no-external-resource", "error", 3],
			["no-network", "error", 4],
			["no-network", "error", 4],
			["no-network", "error", 4],
		],
	);
	assert.equal(issues[3]?.match, "fetch(");
});

test("unsupported elements, svg and attributes are reported in markup only", () => {
	assert.deepEqual(rules(`<form><input></form><video></video><div contenteditable="true"></div>`), [
		"no-unsupported-element",
		"no-unsupported-element",
		"no-unsupported-element",
		"no-unsupported-attribute",
	]);
	assert.deepEqual(rules(`<svg><mask/><clipPath/><animate/></svg>`), [
		"no-unsupported-svg",
		"no-unsupported-svg",
		"no-unsupported-svg",
	]);
	// the same words inside script/style are not markup
	assert.deepEqual(rules(`<script>const s = "<input>";</script><style>/* <video> */</style>`), []);
});

test("css rules fire in style blocks and style attributes", () => {
	assert.deepEqual(
		rules(
			`<style>@import "x.css";@font-face{}.a{height:100vh;overflow:auto;position:sticky}.b:has(i){text-shadow:0 0 1px}</style>`,
		),
		[
			"no-unsupported-at-rule",
			"no-unsupported-at-rule",
			"no-viewport-units",
			"no-scroll",
			"no-scroll",
			"no-unsupported-css",
			"no-unsupported-css",
		],
	);
	assert.deepEqual(
		rules(`<div style="height: 50dvh"></div><p style='transform: rotateX(4deg)'></p>`),
		["no-viewport-units", "no-unsupported-css"],
	);
});

test("script rules cover dialogs, disabled apis and unsupported events, also in handler attributes", () => {
	assert.deepEqual(
		rules(`<script>alert(1);navigator.clipboard.writeText("x");new Blob([]);el.addEventListener("keydown",f);c.getContext("webgl");el.ontouchstart=f</script>
<button onwheel="x()" onclick="confirm('?')">b</button>`),
		[
			"no-dialogs",
			"no-unsupported-api",
			"no-unsupported-api",
			"no-unsupported-events",
			"no-unsupported-api",
			"no-unsupported-events",
			"no-unsupported-events",
			"no-dialogs",
		],
	);
});

test("issues carry line numbers in source order", () => {
	const issues = lintHtml("<p>a</p>\n<p>b</p>\n<input>\n<script>\nalert(1)\n</script>");
	assert.deepEqual(
		issues.map((i) => i.line),
		[3, 5],
	);
	assert.ok(issues.every((i) => typeof i.message === "string" && i.message.length > 0));
});
