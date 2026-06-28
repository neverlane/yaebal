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
			{ label: "yaebal (meta)", href: "/docs/yaebal", badge: "new" },
			{ label: "getting started", href: "/docs/getting-started" },
			{ label: "create a bot", href: "/docs/scaffolding", badge: "new" },
			{ label: "core concepts", href: "/docs/core" },
		],
	},
	{
		title: "core",
		items: [
			{ label: "context & filters", href: "/docs/context" },
			{ label: "contexts (autogen)", href: "/docs/contexts", badge: "killer" },
			{ label: "media & files", href: "/docs/media" },
			{ label: "hooks & errors", href: "/docs/hooks" },
			{ label: "webhooks & deploy", href: "/docs/webhooks" },
		],
	},
	{
		title: "plugins",
		items: [
			{ label: "overview", href: "/docs/plugins" },
			{ label: "fmt (markdown/html)", href: "/docs/plugins/fmt", badge: "new" },
			{ label: "filters", href: "/docs/plugins/filters", badge: "new" },
			{ label: "conversation", href: "/docs/plugins/conversation", badge: "new" },
			{ label: "again", href: "/docs/plugins/again" },
			{ label: "session", href: "/docs/plugins/session" },
			{ label: "keyboard", href: "/docs/plugins/keyboard" },
			{ label: "callback-data", href: "/docs/plugins/callback-data" },
			{ label: "morda", href: "/docs/plugins/morda" },
			{ label: "i18n", href: "/docs/plugins/i18n" },
			{ label: "scenes", href: "/docs/plugins/scenes" },
			{ label: "prompt", href: "/docs/plugins/prompt" },
			{ label: "router", href: "/docs/plugins/router" },
			{ label: "commands", href: "/docs/plugins/commands" },
			{ label: "throttle", href: "/docs/plugins/throttle" },
			{ label: "ratelimiter", href: "/docs/plugins/ratelimiter" },
			{ label: "files", href: "/docs/plugins/files" },
			{ label: "broadcast", href: "/docs/plugins/broadcast" },
			{ label: "pagination", href: "/docs/plugins/pagination" },
			{ label: "media-group", href: "/docs/plugins/media-group" },
			{ label: "media-cache", href: "/docs/plugins/media-cache" },
			{ label: "split", href: "/docs/plugins/split" },
			{ label: "panel", href: "/docs/plugins/panel" },
		],
	},
	{
		title: "scaling",
		items: [
			{ label: "web (edge)", href: "/docs/plugins/web", badge: "new" },
			{ label: "runner", href: "/docs/runner", badge: "new" },
			{ label: "workers", href: "/docs/workers", badge: "new" },
			{ label: "runtimes", href: "/docs/runtimes", badge: "new" },
		],
	},
	{
		title: "reference",
		items: [
			{ label: "@yaebal/types", href: "/docs/types" },
			{ label: "packages map", href: "/docs/packages" },
		],
	},
];

export const GITHUB = "https://github.com/neverlane/yaebal";
export const NPM = "https://www.npmjs.com/org/yaebal";
