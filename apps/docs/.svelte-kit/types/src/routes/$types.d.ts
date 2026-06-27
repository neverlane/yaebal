import type * as Kit from '@sveltejs/kit';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;
type RouteParams = {  };
type RouteId = '/';
type MaybeWithVoid<T> = {} extends T ? T | void : T;
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K; }[keyof T];
type OutputDataShape<T> = MaybeWithVoid<Omit<App.PageData, RequiredKeys<T>> & Partial<Pick<App.PageData, keyof T & keyof App.PageData>> & Record<string, any>>
type EnsureDefined<T> = T extends null | undefined ? {} : T;
type OptionalUnion<U extends Record<string, any>, A extends keyof U = U extends U ? keyof U : never> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;
export type Snapshot<T = any> = Kit.Snapshot<T>;
type PageParentData = EnsureDefined<LayoutData>;
type LayoutRouteId = RouteId | "/" | "/docs" | "/docs/context" | "/docs/contexts" | "/docs/core" | "/docs/getting-started" | "/docs/hooks" | "/docs/introduction" | "/docs/media" | "/docs/packages" | "/docs/plugins" | "/docs/plugins/again" | "/docs/plugins/broadcast" | "/docs/plugins/callback-data" | "/docs/plugins/commands" | "/docs/plugins/conversation" | "/docs/plugins/files" | "/docs/plugins/filters" | "/docs/plugins/fmt" | "/docs/plugins/i18n" | "/docs/plugins/keyboard" | "/docs/plugins/media-cache" | "/docs/plugins/media-group" | "/docs/plugins/morda" | "/docs/plugins/pagination" | "/docs/plugins/panel" | "/docs/plugins/prompt" | "/docs/plugins/ratelimiter" | "/docs/plugins/router" | "/docs/plugins/scenes" | "/docs/plugins/session" | "/docs/plugins/split" | "/docs/plugins/throttle" | "/docs/plugins/web" | "/docs/runner" | "/docs/runtimes" | "/docs/scaffolding" | "/docs/types" | "/docs/webhooks" | "/docs/workers" | "/docs/yaebal" | "/playground" | null
type LayoutParams = RouteParams & {  }
type LayoutParentData = EnsureDefined<{}>;

export type PageServerData = null;
export type PageData = Expand<PageParentData>;
export type PageProps = { params: RouteParams; data: PageData }
export type LayoutServerData = null;
export type LayoutLoad<OutputData extends OutputDataShape<LayoutParentData> = OutputDataShape<LayoutParentData>> = Kit.Load<LayoutParams, LayoutServerData, LayoutParentData, OutputData, LayoutRouteId>;
export type LayoutLoadEvent = Parameters<LayoutLoad>[0];
export type LayoutData = Expand<Omit<LayoutParentData, keyof LayoutParentData & EnsureDefined<LayoutServerData>> & OptionalUnion<EnsureDefined<LayoutParentData & EnsureDefined<LayoutServerData>>>>;
export type LayoutProps = { params: LayoutParams; data: LayoutData; children: import("svelte").Snippet }