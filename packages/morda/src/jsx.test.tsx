import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import type { DialogState } from "./index.js";
import {
	Button,
	ButtonRow,
	Counter,
	jsxDialogs,
	Pagination,
	Screen,
	Select,
	Toggle,
	Url,
	useDialogData,
	useEffect,
	useNavigation,
	useParams,
	useSession,
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
		call(method: string, params: Record<string, unknown>) {
			calls.push({ method, params });
			if (method.startsWith("send")) return Promise.resolve({ message_id: nextId++ });
			return Promise.resolve(true);
		},
	} as never;

	return { api, calls, of: (method: string) => calls.filter((c) => c.method === method) };
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

// biome-ignore lint/suspicious/noExplicitAny: reaching into recorded params
const labelAt = (params: any, row: number, col: number): string =>
	params.reply_markup.inline_keyboard[row][col].text;

test("useState re-renders once per tap, even with several setState calls", async () => {
	function TwoCounters() {
		const [a, setA] = useState(0);
		const [b, setB] = useState(10);
		return (
			<Screen>
				{`a=${a} b=${b}`}
				<ButtonRow>
					<Button
						id="both"
						onClick={() => {
							setA((v) => v + 1);
							setB((v) => v + 1);
						}}
					>
						+
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ two: TwoCounters }))
			.command("go", (ctx) => ctx.dialog.start("two")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	assert.equal(of("sendMessage")[0]?.params.text, "a=0 b=10");
	const inc = dataAt(of("sendMessage")[0]?.params, 0, 0);
	calls.length = 0;

	await mw(cbCtx(api, inc, 1, 100), noop);
	const edits = of("editMessageText");
	assert.equal(edits.length, 1); // both writes batched into one edit
	assert.equal(edits[0]?.params.text, "a=1 b=11");
});

test("setState inside a mount effect lands on screen (loading → loaded)", async () => {
	function Loader() {
		const [data, setData] = useState("loading…");
		useEffect(() => setData("loaded!"), []);
		return (
			<Screen>
				{`state: ${data}`}
				<ButtonRow>
					<Button id="x">.</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ loader: Loader }))
			.command("go", (ctx) => ctx.dialog.start("loader")),
	);

	await mw(msgCtx(api, "/go", 42), noop);
	// initial send shows the pre-effect view, then the effect's setState edits it
	assert.equal(of("sendMessage")[0]?.params.text, "state: loading…");
	assert.equal(of("editMessageText").at(-1)?.params.text, "state: loaded!");
});

test("setState inside a deps effect: the freshest render is what stays visible", async () => {
	function Flip() {
		const [n, setN] = useState(0);
		const [label, setLabel] = useState("initial");
		useEffect(() => {
			if (n > 0) setLabel(`derived-from-${n}`);
		}, [n]);
		return (
			<Screen>
				{`n=${n} label=${label}`}
				<ButtonRow>
					<Button id="next" onClick={() => setN((v) => v + 1)}>
						{">"}
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ flip: Flip }))
			.command("go", (ctx) => ctx.dialog.start("flip")),
	);

	await mw(msgCtx(api, "/go", 43), noop);
	const inc = dataAt(of("sendMessage")[0]?.params, 0, 0);
	calls.length = 0;

	await mw(cbCtx(api, inc, 43, 100), noop);
	// the derived value is the LAST edit — never overwritten by a stale render
	assert.equal(of("editMessageText").at(-1)?.params.text, "n=1 label=derived-from-1");
});

test("useEffect([]) runs once per screen instance — and not again after a restart", async () => {
	let runs = 0;
	function Once() {
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

	const storage = new MemoryStorage<DialogState>();
	const { api, of } = fakeApi();
	const install = () =>
		entry(
			new Composer<Context>()
				.install(jsxDialogs({ once: Once }, { storage }))
				.command("go", (ctx) => ctx.dialog.start("once")),
		);

	const mw = install();
	await mw(msgCtx(api, "/go", 1), noop);
	assert.equal(runs, 1);
	const inc = dataAt(of("sendMessage")[0]?.params, 0, 0);

	await mw(cbCtx(api, inc, 1, 100), noop); // re-render — mount effect must not re-fire
	assert.equal(runs, 1);

	// simulate a process restart: a fresh plugin instance over the same storage
	const mw2 = install();
	await mw2(cbCtx(api, inc, 1, 100), noop);
	assert.equal(runs, 1); // deps live in the persisted frame — still mounted
	assert.equal(of("editMessageText").at(-1)?.params.text, "n=2"); // …and state survived
});

test("hook state survives a restart with persistent storage; start() resets it", async () => {
	function CounterScreen() {
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

	const storage = new MemoryStorage<DialogState>();
	const { api, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ c: CounterScreen }, { storage }))
			.command("go", (ctx) => ctx.dialog.start("c")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const inc = dataAt(of("sendMessage")[0]?.params, 0, 0);
	await mw(cbCtx(api, inc, 1, 100), noop); // n=1
	assert.equal(of("editMessageText").at(-1)?.params.text, "n=1");

	await mw(msgCtx(api, "/go", 1), noop); // start() → fresh instance
	assert.equal(of("sendMessage").at(-1)?.params.text, "n=0"); // hook state reset
});

test("useNavigation carries params; useParams reads them", async () => {
	function Home() {
		const nav = useNavigation();
		return (
			<Screen>
				{"home"}
				<ButtonRow>
					<Button id="go" onClick={() => nav.push(Detail, { item: 42 })}>
						open
					</Button>
				</ButtonRow>
			</Screen>
		);
	}
	function Detail() {
		const { item } = useParams<{ item: number }>();
		const nav = useNavigation();
		return (
			<Screen>
				{`item ${item}`}
				<ButtonRow>
					<Button id="back" onClick={() => nav.back()}>
						back
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ home: Home, detail: Detail }))
			.command("go", (ctx) => ctx.dialog.start("home")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const open = dataAt(of("sendMessage")[0]?.params, 0, 0);
	calls.length = 0;

	await mw(cbCtx(api, open, 1, 100), noop);
	const detail = of("editMessageText")[0];
	assert.equal(detail?.params.text, "item 42");

	calls.length = 0;
	await mw(cbCtx(api, dataAt(detail?.params, 0, 0), 1, 100), noop);
	assert.equal(of("editMessageText")[0]?.params.text, "home");
});

test("useDialogData is shared across screens of one dialog", async () => {
	function First() {
		const [data, patch] = useDialogData<{ name?: string }>();
		const nav = useNavigation();
		return (
			<Screen>
				{`first ${data.name ?? "?"}`}
				<ButtonRow>
					<Button
						id="set"
						onClick={() => {
							patch({ name: "alice" });
							return nav.push(Second);
						}}
					>
						set + go
					</Button>
				</ButtonRow>
			</Screen>
		);
	}
	function Second() {
		const [data] = useDialogData<{ name?: string }>();
		return <Screen>{`second ${data.name ?? "?"}`}</Screen>;
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ first: First, second: Second }))
			.command("go", (ctx) => ctx.dialog.start("first")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const set = dataAt(of("sendMessage")[0]?.params, 0, 0);
	calls.length = 0;

	await mw(cbCtx(api, set, 1, 100), noop);
	assert.equal(of("editMessageText").at(-1)?.params.text, "second alice");
});

test("<Screen onText> consumes free text; screens without it fall through", async () => {
	const seen: string[] = [];
	let fallthrough = 0;
	function Ask() {
		const [answer, setAnswer] = useState("");
		return (
			<Screen
				onText={(ctx) => {
					seen.push(ctx.text);
					setAnswer(ctx.text);
				}}
			>
				{answer === "" ? "type something" : `you said: ${answer}`}
			</Screen>
		);
	}

	const { api, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ ask: Ask }))
			.command("go", (ctx) => ctx.dialog.start("ask"))
			.on("message:text", () => {
				fallthrough++;
			}),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	await mw(msgCtx(api, "hello", 1), noop);
	assert.deepEqual(seen, ["hello"]);
	assert.equal(fallthrough, 0);
	assert.equal(of("editMessageText").at(-1)?.params.text, "you said: hello");
});

test("Url buttons render alongside callback buttons", async () => {
	function Links() {
		return (
			<Screen>
				{"links"}
				<ButtonRow>
					<Url url="https://example.com">docs</Url>
					<Button id="ok">ok</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ links: Links }))
			.command("go", (ctx) => ctx.dialog.start("links")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const kb = of("sendMessage")[0]?.params.reply_markup.inline_keyboard;
	assert.equal(kb[0][0].url, "https://example.com");
	assert.equal(typeof kb[0][1].callback_data, "string");
});

test("Counter widget steps and clamps", async () => {
	function Volume() {
		return (
			<Screen>
				{"volume"}
				<Counter id="vol" min={0} max={2} />
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ v: Volume }))
			.command("go", (ctx) => ctx.dialog.start("v")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	assert.equal(labelAt(sent?.params, 0, 1), "0");
	const plus = dataAt(sent?.params, 0, 2);
	calls.length = 0;

	await mw(cbCtx(api, plus, 1, 100), noop);
	assert.equal(labelAt(of("editMessageText")[0]?.params, 0, 1), "1");

	await mw(cbCtx(api, plus, 1, 100), noop); // 2 (max)
	await mw(cbCtx(api, plus, 1, 100), noop); // clamped — no edit
	assert.equal(labelAt(of("editMessageText").at(-1)?.params, 0, 1), "2");
});

test("Toggle widget flips its mark", async () => {
	function Settings() {
		return (
			<Screen>
				{"settings"}
				<ButtonRow>
					<Toggle id="dark">dark mode</Toggle>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ s: Settings }))
			.command("go", (ctx) => ctx.dialog.start("s")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	assert.equal(labelAt(sent?.params, 0, 0), "☐ dark mode");
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop);
	assert.equal(labelAt(of("editMessageText")[0]?.params, 0, 0), "☑ dark mode");
});

test("Select widget marks the chosen item", async () => {
	const langs = [
		{ code: "en", name: "english" },
		{ code: "ru", name: "русский" },
	];
	function Lang() {
		return (
			<Screen>
				{"language"}
				<Select id="lang" items={langs} itemId={(l) => l.code} label={(l) => l.name} columns={2} />
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ l: Lang }))
			.command("go", (ctx) => ctx.dialog.start("l")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 1), 1, 100), noop); // pick "ru"
	const kb = of("editMessageText")[0]?.params;
	assert.equal(labelAt(kb, 0, 0), "english");
	assert.equal(labelAt(kb, 0, 1), "✓ русский");
});

test("Pagination widget is controlled by parent state", async () => {
	function Pager() {
		const [page, setPage] = useState(1);
		return (
			<Screen>
				{`page ${page}`}
				<Pagination id="p" page={page} pages={3} onPage={setPage} />
			</Screen>
		);
	}

	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ p: Pager }))
			.command("go", (ctx) => ctx.dialog.start("p")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	const next = dataAt(sent?.params, 0, 3);
	calls.length = 0;

	await mw(cbCtx(api, next, 1, 100), noop);
	assert.equal(of("editMessageText")[0]?.params.text, "page 2");
	assert.equal(labelAt(of("editMessageText")[0]?.params, 0, 2), "2/3");
});

test("conditional hooks fail loud", async () => {
	function Sneaky() {
		const [flag, setFlag] = useState(true);
		const label = flag ? useState("extra")[0] : "gone"; // conditional on purpose
		return (
			<Screen>
				{`${label}`}
				<ButtonRow>
					<Button id="flip" onClick={() => setFlag(false)}>
						flip
					</Button>
				</ButtonRow>
			</Screen>
		);
	}

	const { api, of } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ s: Sneaky }))
			.command("go", (ctx) => ctx.dialog.start("s")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const flip = dataAt(of("sendMessage")[0]?.params, 0, 0);
	await assert.rejects(
		Promise.resolve(mw(cbCtx(api, flip, 1, 100), noop)),
		/hooks must run unconditionally/,
	);
});

test("useSession throws a clear error when the session plugin is missing", async () => {
	function NeedsSession() {
		const session = useSession<{ n: number }>();
		return <Screen>{`n=${session.n}`}</Screen>;
	}

	const { api } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(jsxDialogs({ s: NeedsSession }))
			.command("go", (ctx) => ctx.dialog.start("s")),
	);

	await assert.rejects(
		Promise.resolve(mw(msgCtx(api, "/go", 1), noop)),
		/useSession\(\) requires @yaebal\/session/,
	);
});
