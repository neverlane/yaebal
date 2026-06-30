import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import {
	Button,
	ButtonRow,
	jsxDialogs,
	Screen,
	useEffect,
	useNavigation,
	useState,
} from "./jsx/index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

interface Call {
	method: string;
	// biome-ignore lint/suspicious/noExplicitAny: test recorder captures arbitrary params
	params: any;
}

function fakeApi() {
	const calls: Call[] = [];
	let nextId = 100;

	const api = {
		sendMessage(params: Record<string, unknown>) {
			calls.push({ method: "sendMessage", params });
			return Promise.resolve({ message_id: nextId++ });
		},
		answerCallbackQuery(params: Record<string, unknown>) {
			calls.push({ method: "answerCallbackQuery", params });
			return Promise.resolve(true);
		},
		call(method: string, params: Record<string, unknown>) {
			calls.push({ method, params });
			return Promise.resolve(true);
		},
	} as never;

	return { api, calls };
}

const msgCtx = (api: never, text: string, chatId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});

const cbCtx = (api: never, data: string, chatId: number, messageId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			callback_query: {
				id: "cb",
				from: { id: chatId, is_bot: false, first_name: "u" },
				message: { message_id: messageId, date: 0, chat: { id: chatId, type: "private" } },
				data,
			},
		} as never,
		updateType: "callback_query",
	});

// biome-ignore lint/suspicious/noExplicitAny: reaching into recorded params
const dataAt = (params: any, row: number, col: number): string =>
	params.reply_markup.inline_keyboard[row][col].callback_data;

test("useState re-renders the screen in place on setState", async () => {
	function Counter() {
		const [n, setN] = useState(0);
		return (
			<Screen>
				{`n=${n}`}
				<ButtonRow>
					<Button id="inc" onClick={() => setN((v) => v + 1)}>
						+
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ counter: Counter }))
			.command("go", (ctx) => ctx.dialog.start("counter")),
	);

	await mw(msgCtx(api, "/go", 1), noop);

	const sent = calls.find((c) => c.method === "sendMessage");
	assert.equal(sent?.params.text, "n=0");

	const incData = dataAt(sent?.params, 0, 0);
	calls.length = 0;

	await mw(cbCtx(api, incData, 1, 100), noop);
	assert.equal(calls.find((c) => c.method === "editMessageText")?.params.text, "n=1");

	calls.length = 0;

	await mw(cbCtx(api, incData, 1, 100), noop);
	assert.equal(calls.find((c) => c.method === "editMessageText")?.params.text, "n=2");
});

test("useEffect with [] runs once on mount, not on re-render", async () => {
	let runs = 0;
	function Screen1() {
		const [n, setN] = useState(0);

		useEffect(() => {
			runs++;
		}, []);

		return (
			<Screen>
				{`n=${n}`}
				<ButtonRow>
					<Button id="inc" onClick={() => setN((v) => v + 1)}>
						+
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ s: Screen1 }))
			.command("go", (ctx) => ctx.dialog.start("s")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	assert.equal(runs, 1);

	const incData = dataAt(calls.find((c) => c.method === "sendMessage")?.params, 0, 0);

	await mw(cbCtx(api, incData, 1, 100), noop); // re-renders twice (find + after setState)
	assert.equal(runs, 1);
});

test("reopening a closed screen resets hook state", async () => {
	let runs = 0;
	function Counter() {
		const [n, setN] = useState(0);
		const { back } = useNavigation();

		useEffect(() => {
			runs++;
		}, []);

		return (
			<Screen>
				{`n=${n}`}
				<ButtonRow>
					<Button id="inc" onClick={() => setN((v) => v + 1)}>
						+
					</Button>
				</ButtonRow>
				<ButtonRow>
					<Button id="close" onClick={() => back()}>
						x
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls } = fakeApi();

	// distinct window id ("rc") so this test's hook slots don't collide with the
	// other counter test (module-level slot store is keyed by chat:window).
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ rc: Counter }))
			.command("go", (ctx) => ctx.dialog.start("rc")),
	);

	await mw(msgCtx(api, "/go", 1), noop);

	let sent = calls.find((c) => c.method === "sendMessage");
	assert.equal(sent?.params.text, "n=0");
	assert.equal(runs, 1);

	const incData = dataAt(sent?.params, 0, 0);
	const closeData = dataAt(sent?.params, 1, 0);

	await mw(cbCtx(api, incData, 1, 100), noop); // n=1
	calls.length = 0;

	await mw(cbCtx(api, closeData, 1, 100), noop); // back() at root → close + evict slots
	assert.ok(calls.some((c) => c.method === "deleteMessage"));

	calls.length = 0;
	await mw(msgCtx(api, "/go", 1), noop); // reopen

	sent = calls.find((c) => c.method === "sendMessage");
	assert.equal(sent?.params.text, "n=0"); // counter reset, not "n=1"
	assert.equal(runs, 2); // mount effect re-fired
});

test("useNavigation pushes and pops across screens", async () => {
	function Detail() {
		const { back } = useNavigation();
		return (
			<Screen>
				{"detail"}
				<ButtonRow>
					<Button id="back" onClick={() => back()}>
						back
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	function Home() {
		const { push } = useNavigation();
		return (
			<Screen>
				{"home"}
				<ButtonRow>
					<Button id="go" onClick={() => push(Detail)}>
						detail
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ home: Home, detail: Detail }))
			.command("go", (ctx) => ctx.dialog.start("home")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const goData = dataAt(calls.find((c) => c.method === "sendMessage")?.params, 0, 0);

	calls.length = 0;
	await mw(cbCtx(api, goData, 1, 100), noop);

	const edit1 = calls.find((c) => c.method === "editMessageText");
	assert.equal(edit1?.params.text, "detail");

	calls.length = 0;
	await mw(cbCtx(api, dataAt(edit1?.params, 0, 0), 1, 100), noop);

	assert.equal(calls.find((c) => c.method === "editMessageText")?.params.text, "home");
});
