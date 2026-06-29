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
			{ label: "yaebal", href: "/docs/yaebal", badge: "meta" },
			{ label: "getting started", href: "/docs/getting-started" },
			{ label: "create a bot", href: "/docs/scaffolding", badge: "new" },
			{ label: "core concepts", href: "/docs/core" },
			{ label: "examples", href: "/docs/examples", badge: "new" },
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
		title: "plugins / state",
		items: [
			{ label: "overview", href: "/docs/plugins" },
			{ label: "session", href: "/docs/plugins/session" },
			{ label: "i18n", href: "/docs/plugins/i18n" },
			{ label: "scenes", href: "/docs/plugins/scenes" },
			{ label: "onboarding", href: "/docs/plugins/onboarding", badge: "new" },
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
			{ label: "runner", href: "/docs/runner" },
			{ label: "workers", href: "/docs/workers" },
			{ label: "runtimes", href: "/docs/runtimes" },
			{ label: "router", href: "/docs/plugins/router" },
			{ label: "test", href: "/docs/plugins/test" },
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
