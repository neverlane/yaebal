export interface NavItem {
	label: string;
	href: string;
	badge?: string;
}

export interface NavSection {
	title: string;
	items: NavItem[];
}

export const nav: NavSection[] = [
	{
		title: "guide",
		items: [
			{ label: "introduction", href: "/docs/introduction" },
			{ label: "yaebal meta", href: "/docs/yaebal" },
			{ label: "getting started", href: "/docs/getting-started" },
			{ label: "create a bot", href: "/docs/scaffolding" },
			{ label: "core concepts", href: "/docs/core" },
			{ label: "examples", href: "/docs/examples" },
			{ label: "cheat sheet", href: "/docs/cheat-sheet", badge: "new" },
			{ label: "typed examples", href: "/docs/typed-examples", badge: "new" },
			{ label: "faq", href: "/docs/faq", badge: "new" },
			{ label: "troubleshooting", href: "/docs/troubleshooting", badge: "new" },
		],
	},
	{
		title: "core",
		items: [
			{ label: "context & filters", href: "/docs/context" },
			{ label: "contexts (autogen)", href: "/docs/contexts" },
			{ label: "media & files", href: "/docs/media" },
			{ label: "hooks & errors", href: "/docs/hooks" },
			{ label: "webhooks & deploy", href: "/docs/webhooks" },
		],
	},
	{
		title: "telegram guides",
		items: [
			{ label: "payments & stars", href: "/docs/telegram/payments", badge: "new" },
			{ label: "inline mode", href: "/docs/telegram/inline-mode", badge: "new" },
			{ label: "chat admin", href: "/docs/telegram/chat-admin", badge: "new" },
			{ label: "service events", href: "/docs/telegram/service-events", badge: "new" },
			{ label: "message extras", href: "/docs/telegram/message-extras", badge: "new" },
			{ label: "deep links", href: "/docs/telegram/deep-links", badge: "new" },
			{ label: "mini apps", href: "/docs/telegram/mini-apps", badge: "new" },
		],
	},
	{
		title: "migration",
		items: [
			{ label: "from gramio", href: "/docs/migration/gramio", badge: "new" },
			{ label: "from puregram", href: "/docs/migration/puregram", badge: "new" },
			{ label: "from grammy", href: "/docs/migration/grammy", badge: "new" },
			{ label: "from telegraf", href: "/docs/migration/telegraf", badge: "new" },
		],
	},
	{
		title: "plugins / state",
		items: [
			{ label: "overview", href: "/docs/plugins" },
			{ label: "authoring", href: "/docs/plugins/authoring" },
			{ label: "session", href: "/docs/plugins/session" },
			{ label: "i18n", href: "/docs/plugins/i18n" },
			{ label: "scenes", href: "/docs/plugins/scenes" },
			{ label: "onboarding", href: "/docs/plugins/onboarding" },
			{ label: "conversation", href: "/docs/plugins/conversation" },
			{ label: "prompt", href: "/docs/plugins/prompt" },
			{ label: "morda", href: "/docs/plugins/morda" },
		],
	},
	{
		title: "plugins / ui",
		items: [
			{ label: "keyboard", href: "/docs/plugins/keyboard" },
			{ label: "callback-data", href: "/docs/plugins/callback-data" },
			{ label: "pagination", href: "/docs/plugins/pagination" },
			{ label: "fmt (markdown/html)", href: "/docs/plugins/fmt" },
			{ label: "rich (sendRichMessage)", href: "/docs/plugins/rich", badge: "new" },
			{ label: "filters", href: "/docs/plugins/filters" },
			{ label: "commands", href: "/docs/plugins/commands" },
		],
	},
	{
		title: "plugins / media",
		items: [
			{ label: "files", href: "/docs/plugins/files" },
			{ label: "media-cache", href: "/docs/plugins/media-cache" },
			{ label: "media-group", href: "/docs/plugins/media-group" },
			{ label: "split", href: "/docs/plugins/split" },
			{ label: "preview", href: "/docs/plugins/preview" },
		],
	},
	{
		title: "plugins / ops",
		items: [
			{ label: "again", href: "/docs/plugins/again" },
			{ label: "throttle", href: "/docs/plugins/throttle" },
			{ label: "ratelimiter", href: "/docs/plugins/ratelimiter" },
			{ label: "broadcast", href: "/docs/plugins/broadcast" },
			{ label: "panel", href: "/docs/plugins/panel" },
		],
	},
	{
		title: "scaling",
		items: [
			{ label: "web (edge)", href: "/docs/plugins/web" },
			{ label: "production", href: "/docs/production", badge: "new" },
			{ label: "runner", href: "/docs/runner" },
			{ label: "workers", href: "/docs/workers" },
			{ label: "runtimes", href: "/docs/runtimes" },
			{ label: "router", href: "/docs/plugins/router" },
			{ label: "toml", href: "/docs/plugins/toml", badge: "new" },
			{ label: "test", href: "/docs/plugins/test" },
		],
	},
	{
		title: "reference",
		items: [
			{ label: "bot api reference", href: "/docs/api", badge: "new" },
			{ label: "@yaebal/types", href: "/docs/types" },
			{ label: "llms", href: "/docs/llms", badge: "new" },
			{ label: "packages map", href: "/docs/packages" },
		],
	},
];

export const flatNav = nav.flatMap((section) => section.items);

export function navNeighbors(pathname: string): { previous?: NavItem; next?: NavItem } {
	const clean = pathname.replace(/\/$/, "") || "/";
	const index = flatNav.findIndex((item) => item.href.replace(/\/$/, "") === clean);

	return {
		previous: index > 0 ? flatNav[index - 1] : undefined,
		next: index >= 0 ? flatNav[index + 1] : undefined,
	};
}

export function docsSourcePath(pathname: string): string | undefined {
	const clean = pathname.replace(/\/$/, "");
	if (!clean.startsWith("/docs/")) return undefined;

	return `apps/docs/src/routes${clean}/+page.svelte`;
}

export const GITHUB = "https://github.com/neverlane/yaebal";
export const NPMX = "https://npmx.dev/org/yaebal";
