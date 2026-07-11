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
			{ label: "recipes", href: "/docs/recipes" },
			{ label: "comparison", href: "/docs/comparison" },
			{ label: "cheat sheet", href: "/docs/cheat-sheet" },
			{ label: "typed examples", href: "/docs/typed-examples" },
			{ label: "faq", href: "/docs/faq" },
			{ label: "troubleshooting", href: "/docs/troubleshooting" },
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
			{ label: "payments & stars", href: "/docs/telegram/payments" },
			{ label: "inline mode", href: "/docs/telegram/inline-mode" },
			{ label: "chat admin", href: "/docs/telegram/chat-admin" },
			{ label: "service events", href: "/docs/telegram/service-events" },
			{ label: "message extras", href: "/docs/telegram/message-extras" },
			{ label: "deep links", href: "/docs/telegram/deep-links" },
			{ label: "mini apps", href: "/docs/telegram/mini-apps" },
		],
	},
	{
		title: "migration",
		items: [
			{ label: "from gramio", href: "/docs/migration/gramio" },
			{ label: "from puregram", href: "/docs/migration/puregram" },
			{ label: "from grammy", href: "/docs/migration/grammy" },
			{ label: "from telegraf", href: "/docs/migration/telegraf" },
		],
	},
	{
		title: "plugins / state",
		items: [
			{ label: "overview", href: "/docs/plugins" },
			{ label: "authoring", href: "/docs/plugins/authoring" },
			{ label: "session", href: "/docs/plugins/session" },
			{ label: "sklad (storage)", href: "/docs/plugins/sklad", badge: "new" },
			{ label: "cache", href: "/docs/plugins/cache", badge: "new" },
			{ label: "feature-flags", href: "/docs/plugins/feature-flags", badge: "new" },
			{ label: "i18n", href: "/docs/plugins/i18n" },
			{ label: "scenes", href: "/docs/plugins/scenes" },
			{ label: "state-machine", href: "/docs/plugins/state-machine", badge: "new" },
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
			{ label: "link-preview", href: "/docs/plugins/link-preview", badge: "new" },
			{ label: "inline-results", href: "/docs/plugins/inline-results", badge: "new" },
			{ label: "auto-answer", href: "/docs/plugins/auto-answer", badge: "new" },
			{ label: "typing", href: "/docs/plugins/typing", badge: "new" },
			{ label: "pagination", href: "/docs/plugins/pagination" },
			{ label: "fmt (markdown/html)", href: "/docs/plugins/fmt" },
			{ label: "rich messages", href: "/docs/plugins/rich" },
			{ label: "filters", href: "/docs/plugins/filters" },
			{ label: "guards", href: "/docs/plugins/guards", badge: "new" },
			{ label: "commands", href: "/docs/plugins/commands" },
			{ label: "payments", href: "/docs/plugins/payments", badge: "new" },
			{ label: "mini-app", href: "/docs/plugins/mini-app", badge: "new" },
		],
	},
	{
		title: "plugins / media",
		items: [
			{ label: "files", href: "/docs/plugins/files" },
			{ label: "file-id", href: "/docs/plugins/file-id", badge: "new" },
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
			{ label: "cron", href: "/docs/plugins/cron", badge: "new" },
			{ label: "panel", href: "/docs/plugins/panel" },
			{ label: "analytics", href: "/docs/plugins/analytics", badge: "new" },
			{ label: "audit-log", href: "/docs/plugins/audit-log", badge: "new" },
		],
	},
	{
		title: "scaling",
		items: [
			{ label: "web (edge)", href: "/docs/plugins/web" },
			{ label: "production", href: "/docs/production" },
			{ label: "local bot api", href: "/docs/production/local-bot-api" },
			{ label: "rate limits", href: "/docs/production/rate-limits" },
			{ label: "deploy targets", href: "/docs/production/deploy-targets" },
			{ label: "observability", href: "/docs/production/observability" },
			{ label: "queues & broadcasts", href: "/docs/production/queues-broadcasts" },
			{ label: "runner", href: "/docs/runner" },
			{ label: "workers", href: "/docs/workers" },
			{ label: "runtimes", href: "/docs/runtimes" },
			{ label: "router", href: "/docs/plugins/router" },
			{ label: "toml", href: "/docs/plugins/toml" },
			{ label: "test", href: "/docs/plugins/test" },
		],
	},
	{
		title: "reference",
		items: [
			{ label: "public api reference", href: "/docs/reference" },
			{ label: "bot api reference", href: "/docs/api" },
			{ label: "@yaebal/types", href: "/docs/types" },
			{ label: "llms", href: "/docs/llms" },
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
