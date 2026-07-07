/** @jsxImportSource @yaebal/morda */
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
	useState,
	useUser,
} from "@yaebal/morda/jsx";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/morda-jsx/.env first (copy .env.example)");
	process.exit(1);
}

// the dialog-wide bag: every screen reads and patches the same object
interface Prefs extends Record<string, unknown> {
	dark?: boolean;
	lang?: string;
	name?: string;
}

const LANGS = [
	{ code: "en", name: "english" },
	{ code: "ru", name: "русский" },
	{ code: "de", name: "deutsch" },
];

const TIPS = [
	"hook state is persisted — restart the bot and this dialog keeps working",
	"setState batches: many calls in one handler still edit the message once",
	"effects run after the render is delivered, so load-then-show just works",
	"window ids are typed — nav.push(Settings) navigates by component",
];

function Main() {
	const user = useUser();
	const nav = useNavigation();
	const [taps, setTaps] = useState(0);
	const [prefs] = useDialogData<Prefs>();

	return (
		<Screen>
			{`hi ${prefs.name ?? user?.first_name ?? "there"}! you tapped ${taps} time(s)`}
			<ButtonRow>
				<Button id="tap" onClick={() => setTaps((n) => n + 1)}>
					tap me
				</Button>
			</ButtonRow>
			<ButtonRow>
				<Button id="settings" onClick={() => nav.push(Settings)}>
					⚙️ settings
				</Button>
				<Button id="tips" onClick={() => nav.push(Tips, { startAt: 1 })}>
					💡 tips
				</Button>
			</ButtonRow>
			<ButtonRow>
				<Url url="https://github.com/neverlane/yaebal">source</Url>
			</ButtonRow>
		</Screen>
	);
}

function Settings() {
	const nav = useNavigation();
	const [prefs, patch] = useDialogData<Prefs>();

	return (
		// free-text input while this screen is on top renames the user
		<Screen onText={(ctx) => patch({ name: ctx.text })}>
			{[
				"⚙️ settings",
				`\n· dark mode: ${prefs.dark ? "on" : "off"}`,
				`\n· language: ${prefs.lang ?? "en"}`,
				"\n\nsend any text to set your display name",
			]}
			<ButtonRow>
				<Toggle id="dark" value={prefs.dark ?? false} onChange={(dark) => patch({ dark })}>
					dark mode
				</Toggle>
			</ButtonRow>
			<Select
				id="lang"
				items={LANGS}
				itemId={(l) => l.code}
				label={(l) => l.name}
				selected={prefs.lang ?? "en"}
				onSelect={(lang) => patch({ lang })}
				columns={3}
			/>
			<Counter id="volume" min={0} max={10} />
			<ButtonRow>
				<Button id="back" onClick={() => nav.back()}>
					← back
				</Button>
			</ButtonRow>
		</Screen>
	);
}

function Tips() {
	const nav = useNavigation();
	const { startAt } = useParams<{ startAt?: number }>() ?? {};
	const [page, setPage] = useState(startAt ?? 1);
	const [fetched, setFetched] = useState(false);

	// effects run after the message is delivered — the screen shows "warming up…"
	// for a moment, then edits itself (the load-then-show pattern)
	useEffect(() => {
		setFetched(true);
	}, []);

	return (
		<Screen linkPreview={false}>
			{fetched ? `💡 ${TIPS[page - 1]}` : "warming up…"}
			<Pagination id="pg" page={page} pages={TIPS.length} onPage={setPage} />
			<ButtonRow>
				<Button id="back" onClick={() => nav.back()}>
					← back
				</Button>
			</ButtonRow>
		</Screen>
	);
}

const bot = createBot(token)
	.install(jsxDialogs({ main: Main, settings: Settings, tips: Tips }))
	.command("start", (ctx) => ctx.dialog.start("main"))
	.on("message:text", (ctx) => ctx.reply("send /start to open the menu"))
	.onStart((info) => console.log(`@${info.username} morda-jsx demo is live`));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
