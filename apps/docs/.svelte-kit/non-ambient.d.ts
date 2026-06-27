
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/.omc" | "/.omc/state" | "/.omc/state/sessions" | "/.omc/state/sessions/2ad49742-69dc-45f7-9dcd-f3374c65de2f" | "/docs" | "/docs/.omc" | "/docs/.omc/state" | "/docs/.omc/state/sessions" | "/docs/.omc/state/sessions/2ad49742-69dc-45f7-9dcd-f3374c65de2f" | "/docs/contexts" | "/docs/context" | "/docs/core" | "/docs/getting-started" | "/docs/hooks" | "/docs/introduction" | "/docs/media" | "/docs/packages" | "/docs/plugins" | "/docs/plugins/again" | "/docs/plugins/broadcast" | "/docs/plugins/callback-data" | "/docs/plugins/commands" | "/docs/plugins/conversation" | "/docs/plugins/files" | "/docs/plugins/filters" | "/docs/plugins/fmt" | "/docs/plugins/i18n" | "/docs/plugins/keyboard" | "/docs/plugins/media-cache" | "/docs/plugins/media-group" | "/docs/plugins/morda" | "/docs/plugins/pagination" | "/docs/plugins/panel" | "/docs/plugins/prompt" | "/docs/plugins/ratelimiter" | "/docs/plugins/router" | "/docs/plugins/scenes" | "/docs/plugins/session" | "/docs/plugins/split" | "/docs/plugins/throttle" | "/docs/plugins/web" | "/docs/runner" | "/docs/runtimes" | "/docs/scaffolding" | "/docs/types" | "/docs/webhooks" | "/docs/workers" | "/docs/yaebal" | "/playground";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/.omc": Record<string, never>;
			"/.omc/state": Record<string, never>;
			"/.omc/state/sessions": Record<string, never>;
			"/.omc/state/sessions/2ad49742-69dc-45f7-9dcd-f3374c65de2f": Record<string, never>;
			"/docs": Record<string, never>;
			"/docs/.omc": Record<string, never>;
			"/docs/.omc/state": Record<string, never>;
			"/docs/.omc/state/sessions": Record<string, never>;
			"/docs/.omc/state/sessions/2ad49742-69dc-45f7-9dcd-f3374c65de2f": Record<string, never>;
			"/docs/contexts": Record<string, never>;
			"/docs/context": Record<string, never>;
			"/docs/core": Record<string, never>;
			"/docs/getting-started": Record<string, never>;
			"/docs/hooks": Record<string, never>;
			"/docs/introduction": Record<string, never>;
			"/docs/media": Record<string, never>;
			"/docs/packages": Record<string, never>;
			"/docs/plugins": Record<string, never>;
			"/docs/plugins/again": Record<string, never>;
			"/docs/plugins/broadcast": Record<string, never>;
			"/docs/plugins/callback-data": Record<string, never>;
			"/docs/plugins/commands": Record<string, never>;
			"/docs/plugins/conversation": Record<string, never>;
			"/docs/plugins/files": Record<string, never>;
			"/docs/plugins/filters": Record<string, never>;
			"/docs/plugins/fmt": Record<string, never>;
			"/docs/plugins/i18n": Record<string, never>;
			"/docs/plugins/keyboard": Record<string, never>;
			"/docs/plugins/media-cache": Record<string, never>;
			"/docs/plugins/media-group": Record<string, never>;
			"/docs/plugins/morda": Record<string, never>;
			"/docs/plugins/pagination": Record<string, never>;
			"/docs/plugins/panel": Record<string, never>;
			"/docs/plugins/prompt": Record<string, never>;
			"/docs/plugins/ratelimiter": Record<string, never>;
			"/docs/plugins/router": Record<string, never>;
			"/docs/plugins/scenes": Record<string, never>;
			"/docs/plugins/session": Record<string, never>;
			"/docs/plugins/split": Record<string, never>;
			"/docs/plugins/throttle": Record<string, never>;
			"/docs/plugins/web": Record<string, never>;
			"/docs/runner": Record<string, never>;
			"/docs/runtimes": Record<string, never>;
			"/docs/scaffolding": Record<string, never>;
			"/docs/types": Record<string, never>;
			"/docs/webhooks": Record<string, never>;
			"/docs/workers": Record<string, never>;
			"/docs/yaebal": Record<string, never>;
			"/playground": Record<string, never>
		};
		Pathname(): "/" | "/docs/" | "/docs/contexts/" | "/docs/context/" | "/docs/core/" | "/docs/getting-started/" | "/docs/hooks/" | "/docs/introduction/" | "/docs/media/" | "/docs/packages/" | "/docs/plugins/" | "/docs/plugins/again/" | "/docs/plugins/broadcast/" | "/docs/plugins/callback-data/" | "/docs/plugins/commands/" | "/docs/plugins/conversation/" | "/docs/plugins/files/" | "/docs/plugins/filters/" | "/docs/plugins/fmt/" | "/docs/plugins/i18n/" | "/docs/plugins/keyboard/" | "/docs/plugins/media-cache/" | "/docs/plugins/media-group/" | "/docs/plugins/morda/" | "/docs/plugins/pagination/" | "/docs/plugins/panel/" | "/docs/plugins/prompt/" | "/docs/plugins/ratelimiter/" | "/docs/plugins/router/" | "/docs/plugins/scenes/" | "/docs/plugins/session/" | "/docs/plugins/split/" | "/docs/plugins/throttle/" | "/docs/plugins/web/" | "/docs/runner/" | "/docs/runtimes/" | "/docs/scaffolding/" | "/docs/types/" | "/docs/webhooks/" | "/docs/workers/" | "/docs/yaebal/" | "/playground/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.svg" | string & {};
	}
}