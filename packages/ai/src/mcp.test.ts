import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	createYaebalMcpServer,
	formatMethod,
	formatObject,
	loadExamples,
	loadPlugins,
	loadSchema,
	searchCorpus,
	typeName,
} from "./mcp/index.js";

test("loadSchema: bot api schema resolves through @yaebal/types", () => {
	const schema = loadSchema();
	assert.ok(schema.methods.length > 150);
	assert.ok(schema.objects.length > 300);
	assert.ok(schema.methods.some((m) => m.name === "sendMessageDraft"));
});

test("typeName: renders references, arrays and unions", () => {
	assert.equal(typeName({ type: "reference", reference: "Message" }), "Message");
	assert.equal(
		typeName({ type: "array", array: { type: "reference", reference: "MessageEntity" } }),
		"Array of MessageEntity",
	);
	assert.equal(
		typeName({ type: "any_of", any_of: [{ type: "integer" }, { type: "string" }] }),
		"Integer | String",
	);
});

test("formatMethod/formatObject: parameter tables with requiredness", () => {
	const schema = loadSchema();
	const send = schema.methods.find((m) => m.name === "sendMessage");
	assert.ok(send !== undefined);
	const rendered = formatMethod(send);
	assert.match(rendered, /# sendMessage/);
	assert.match(rendered, /\| chat_id \|.*\| yes \|/);
	assert.match(rendered, /returns: Message/);

	const message = schema.objects.find((o) => o.name === "Message");
	assert.ok(message !== undefined);
	assert.match(formatObject(message), /\| message_id \| Integer \|/);
});

test("data: plugin catalog and examples are bundled and complete", () => {
	const plugins = loadPlugins();
	assert.ok(plugins.length > 30);
	const ai = plugins.find((p) => p.name === "ai");
	assert.equal(ai?.package, "@yaebal/ai");
	assert.match(ai?.readme ?? "", /replyStream/);

	const examples = loadExamples();
	assert.ok(examples.length > 20);
	assert.ok(examples.every((e) => e.source.length > 0));
});

test("data: plugin catalog covers every published package (drift guard)", () => {
	// repo-only: packages added without `pnpm generate` must fail here.
	const packagesDir = fileURLToPath(new URL("../../", import.meta.url));
	const known = new Set(loadPlugins().map((p) => p.name));
	for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		let manifest: { name?: string; private?: boolean };
		try {
			manifest = JSON.parse(readFileSync(join(packagesDir, entry.name, "package.json"), "utf8"));
		} catch {
			continue;
		}
		if (manifest.private === true || !existsSync(join(packagesDir, entry.name, "README.md")))
			continue;
		assert.ok(
			known.has(entry.name),
			`package "${entry.name}" is missing from data/plugins.json — run pnpm --filter @yaebal/ai generate`,
		);
	}
});

test("searchCorpus: ranks by term frequency with title boost", () => {
	const corpus = [
		{ title: "sessions", text: "session storage adapters.\n\nsession keys per chat." },
		{ title: "keyboards", text: "inline keyboards.\n\nnothing about state here." },
	];
	const hits = searchCorpus(corpus, "session storage");
	assert.equal(hits[0]?.title, "sessions");
	assert.match(hits[0]?.snippet ?? "", /session/);
	assert.equal(searchCorpus(corpus, "зюзюка").length, 0);
});

test("createYaebalMcpServer: constructs with all tools registered", () => {
	const server = createYaebalMcpServer();
	assert.ok(server !== undefined);
});
