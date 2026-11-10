import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { raw } from "./html.js";
import { PREVIEW_THEMES, previewPage } from "./preview.js";
import type { TelegramWidget } from "./telegram-widget.js";

interface PreviewWindow {
	TelegramWidget: TelegramWidget;
	__widget: {
		requests: { data: string; options?: unknown; transaction?: unknown; payload?: unknown }[];
		setData(data: { publicData?: string | null; chatData?: string | null }): void;
	};
	opened: string[];
}

/** run the page's stub script (the first inline script) in a fresh context. */
function boot(page: string): PreviewWindow {
	const script = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1] as string;
	const opened: string[] = [];
	const window = {
		opened,
		open(url: string) {
			opened.push(url);
		},
	} as unknown as PreviewWindow & { open(url: string): void };
	runInNewContext(script, { window, console: { info() {} } });
	return window;
}

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test("the page frames the widget with theme variables and a stub before the widget code", () => {
	const page = previewPage(raw("<button id=b>tap</button>"), {
		colorScheme: "dark",
		theme: { button_color: "#ff0000" },
		width: 300,
		height: 120,
		title: "poll <demo>",
	});
	assert.match(page, /^<!doctype html>/);
	assert.match(page, /<title>poll demo><\/title>|<title>poll demo<\/title>|<title>poll demo/);
	assert.match(page, /--tg-theme-button-color:#ff0000/);
	assert.match(page, /--tg-theme-bg-color:#212d3b/);
	assert.match(page, /--tg-color-scheme:dark/);
	assert.match(page, /width:300px;height:120px/);
	assert.ok(page.indexOf("window.TelegramWidget=") < page.indexOf("<button id=b>"));
	const defaults = previewPage("<p>x</p>");
	assert.match(defaults, /width:360px;height:auto/);
	assert.match(defaults, /--tg-theme-bg-color:#ffffff/);
	assert.match(defaults, /<title>widget preview<\/title>/);
});

test("the stub exposes theme, state, viewer and the widget profile", () => {
	const w = boot(
		previewPage("<p></p>", { publicData: '{"a":1}', chatData: "c", chatType: "group" }),
	);
	const tw = w.TelegramWidget;
	assert.equal(tw.profile, 1);
	assert.equal(tw.colorScheme, "light");
	assert.deepEqual(plain(tw.themeParams), PREVIEW_THEMES.light);
	assert.equal(tw.publicData, '{"a":1}');
	assert.equal(tw.chatData, "c");
	assert.equal(tw.chatType, "group");
	assert.deepEqual(plain(tw.viewer), { id: 1, first_name: "Preview", username: "preview" });
	assert.equal(tw.isProfileAtLeast(1), true);
	assert.equal(tw.isProfileAtLeast(2), false);
	assert.equal(tw.isProfileAtLeast("1" as unknown as number), false);
	assert.equal(tw.wallet, null);
	assert.equal(
		tw.HapticFeedback.impactOccurred("light").notificationOccurred("success").selectionChanged(),
		tw.HapticFeedback,
	);
	tw.watchPublicData();
	tw.unwatchPublicData();
	tw.setResizeAnchor("bottom");
	tw.ready();
	tw.copyText("copied");
	tw.openLink("https://example.com");
	tw.openTelegramLink("https://t.me/x");
	assert.deepEqual(w.opened, ["https://example.com", "https://t.me/x"]);

	const none = boot(previewPage("<p></p>")).TelegramWidget;
	assert.equal(none.publicData, null);
	assert.equal(none.chatType, "private");
	assert.equal(boot(previewPage("<p></p>", { chatType: null })).TelegramWidget.chatType, null);
});

test("requests resolve from the answers map and reject otherwise", async () => {
	const w = boot(previewPage("<p></p>", { answers: { a: { ok: 1 }, b: "text", c: null } }));
	const tw = w.TelegramWidget;
	assert.deepEqual(plain(await tw.request("a")), { result: '{"ok":1}' });
	assert.deepEqual(plain(await tw.request("b", { wallet: true })), { result: "text" });
	assert.deepEqual(plain(await tw.request("c")), { result: null });
	await assert.rejects(
		tw.request("missing"),
		(e: unknown) => (e as { code: string }).code === "NOT_ALLOWED",
	);
	assert.deepEqual(plain(w.__widget.requests.map((r) => r.data)), ["a", "b", "c", "missing"]);

	const readOnly = boot(previewPage("<p></p>", { viewer: null, answers: { a: 1 } })).TelegramWidget;
	assert.equal(readOnly.viewer, null);
	await assert.rejects(
		readOnly.request("a"),
		(e: unknown) => (e as { name: string }).name === "WidgetRequestError",
	);
});

test("setData updates state and fires chatDataChanged before publicDataChanged", () => {
	const w = boot(previewPage("<p></p>"));
	const tw = w.TelegramWidget;
	const events: string[] = [];
	const onPublic = () => events.push(`public:${tw.publicData}`);
	tw.onEvent("publicDataChanged", onPublic);
	tw.onEvent("chatDataChanged", () => events.push(`chat:${tw.chatData}`));
	w.__widget.setData({ publicData: "p1", chatData: "c1" });
	w.__widget.setData({ chatData: "c2" });
	tw.offEvent("publicDataChanged", onPublic);
	tw.offEvent("themeChanged", onPublic);
	w.__widget.setData({ publicData: "p2" });
	assert.deepEqual(events, ["chat:c1", "public:p1", "chat:c2"]);
	assert.equal(tw.publicData, "p2");
});

test("wallet: true gives the stub a wallet that records calls", async () => {
	const w = boot(previewPage("<p></p>", { wallet: true }));
	const wallet = w.TelegramWidget.wallet;
	assert.ok(wallet);
	assert.deepEqual(plain(await wallet.sendTransaction({ messages: [] }, "pay")), { result: null });
	assert.deepEqual(plain(await wallet.signData({ type: "text", text: "t" }, "sig")), {
		result: null,
	});
	assert.deepEqual(plain(w.__widget.requests), [
		{ data: "pay", transaction: { messages: [] } },
		{ data: "sig", payload: { type: "text", text: "t" } },
	]);
});
