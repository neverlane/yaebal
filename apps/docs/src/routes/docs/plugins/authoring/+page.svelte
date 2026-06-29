<script lang="ts">
	import Code from "$lib/Code.svelte";

	const contract = `import type { Composer, Context } from "@yaebal/core";

type Plugin<In extends Context = Context, Out extends object = Record<never, never>> =
  <C extends In>(composer: Composer<C>) => Composer<C & Out>;

// installed with:
bot.install(plugin);`;

	const decoratePlugin = `import type { Context, Plugin } from "@yaebal/core";

export interface Clock {
  now(): Date;
}

export function clock(): Plugin<Context, { clock: Clock }> {
  return (composer) =>
    composer.decorate({
      clock: { now: () => new Date() },
    });
}

bot.install(clock()).command("time", (ctx) => {
  return ctx.reply(ctx.clock.now().toISOString());
});`;

	const derivePlugin = `import type { Context, Plugin } from "@yaebal/core";

export interface User {
  id: number;
  name: string;
}

export interface CurrentUserOptions {
  loadUser(id: number): Promise<User | null>;
}

export function currentUser(options: CurrentUserOptions): Plugin<Context, { user: User | null }> {
  return (composer) =>
    composer.derive(async (ctx) => ({
      user: ctx.from ? await options.loadUser(ctx.from.id) : null,
    }));
}

bot.install(currentUser({ loadUser })).on("message:text", (ctx) => {
  console.log(ctx.user?.name ?? "guest");
});`;

	const dependencyPlugin = `import { Bot, type Context, type Plugin } from "@yaebal/core";
import { session } from "@yaebal/session";

interface SessionData {
  userId?: number;
}

interface User {
  id: number;
  name: string;
}

type NeedsSession = Context & { session: SessionData };

export function sessionUser(loadUser: (id: number) => Promise<User>): Plugin<NeedsSession, { user: User | null }> {
  return (composer) =>
    composer.derive(async (ctx) => ({
      user: ctx.session.userId ? await loadUser(ctx.session.userId) : null,
    }));
}

new Bot(token).install(sessionUser(loadUser));
// TypeScript error: ctx.session is not available yet.

new Bot(token)
  .install(session<SessionData>({ initial: () => ({}) }))
  .install(sessionUser(loadUser));
// OK: the session plugin ran first, so the context type satisfies NeedsSession.`;

	const middlewarePlugin = `import type { Context, Plugin } from "@yaebal/core";

export function audit(log: (line: string) => void): Plugin<Context> {
  return (composer) =>
    composer.use(async (ctx, next) => {
      const started = Date.now();

      try {
        await next();
      } finally {
        log(ctx.updateType + " " + (Date.now() - started) + "ms");
      }
    });
}

export function ping(): Plugin<Context> {
  return (composer) =>
    composer.command("ping", (ctx) => ctx.reply("pong"));
}`;

	const botPlugin = `import type { BotPlugin, Context } from "@yaebal/core";

interface TelemetryControls {
  telemetry: { log(line: string): void };
}

export function telemetry(log: (line: string) => void): BotPlugin<Context, TelemetryControls> {
  return (bot) =>
    bot
      .onStart((info) => log("started @" + info.username))
      .onStop(() => log("stopped"))
      .decorate({ telemetry: { log } });
}

bot.install(telemetry(console.log));`;

	const apiHook = `import type { Api } from "@yaebal/core";

export function traceApi(api: Api, log: (line: string) => void): void {
  api.before((method) => {
    log("telegram request: " + method);
    return undefined;
  });
}`;

	const packageJson = `{
  "name": "@acme/yaebal-clock",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "import": "./lib/index.js"
    }
  },
  "peerDependencies": {
    "@yaebal/core": ">=0.0.3"
  },
  "devDependencies": {
    "@yaebal/core": ">=0.0.3",
    "typescript": "latest"
  }
}`;
</script>

<svelte:head>
	<title>plugin authoring — yaebal</title>
</svelte:head>

<h1>plugin authoring</h1>
<p class="lead">
	build plugins as typed composer or bot extensions. a plugin receives the current chain, mutates or
	returns it, and tells typescript what context it requires and what context it adds.
</p>

<h2>the contract</h2>
<p>
	<code>Plugin&lt;In, Out&gt;</code> is exported by <code>@yaebal/core</code>. <code>In</code>
	is the context your plugin needs before it can be installed. <code>Out</code> is what your plugin
	adds for downstream handlers.
</p>
<Code code={contract} title="contract.ts" />

<table>
	<thead>
		<tr><th>type</th><th>meaning</th></tr>
	</thead>
	<tbody>
		<tr><td><code>In</code></td><td>required context. use this for explicit plugin dependencies.</td></tr>
		<tr><td><code>Out</code></td><td>fields added to <code>ctx</code> after installation.</td></tr>
		<tr><td><code>Composer&lt;C&gt;</code></td><td>the chain being extended. <code>Bot</code> also works because <code>Bot extends Composer</code>.</td></tr>
	</tbody>
</table>

<h2>static helpers with decorate</h2>
<p>
	use <code>decorate()</code> for constants, long-lived services, and pure helper objects. it has no
	per-update middleware cost; the value is assigned when the chain runs.
</p>
<Code code={decoratePlugin} title="clock.ts" />

<h2>per-update state with derive</h2>
<p>
	use <code>derive()</code> when the value depends on the current update or needs async work. the
	returned object is assigned to <code>ctx</code> before downstream handlers run.
</p>
<Code code={derivePlugin} title="current-user.ts" />

<h2>dependencies are types</h2>
<p>
	do not rely on hidden install order. if a plugin needs another plugin's context field, put that
	field in <code>In</code>. installing it too early becomes a compile-time error.
</p>
<Code code={dependencyPlugin} title="dependencies.ts" />

<h2>middleware and handlers</h2>
<p>
	plugins can also register raw middleware, commands, filters, and handlers. if the plugin does not
	add fields to <code>ctx</code>, leave <code>Out</code> as the default.
</p>
<Code code={middlewarePlugin} title="middleware.ts" />

<h2>bot plugins and lifecycle</h2>
<p>
	use <code>BotPlugin</code> when a plugin needs bot-only features such as <code>bot.api</code>,
	<code>onStart()</code>, or <code>onStop()</code>. the shape mirrors <code>Plugin</code>, but the
	function receives a <code>Bot</code> instead of a plain <code>Composer</code>.
</p>
<Code code={botPlugin} title="bot-plugin.ts" />

<h2>direct api hooks</h2>
<p>
	request hooks still live on <code>Api</code>. expose a direct helper when users may want to wire a
	standalone API instance without a bot.
</p>
<Code code={apiHook} title="api-hook.ts" />

<h2>publishing shape</h2>
<p>
	third-party plugin packages should be ESM, export types, and use <code>@yaebal/core</code> as a
	peer dependency so the app and plugin share the same public types.
</p>
<Code code={packageJson} title="package.json" lang="json" />

<h2>checklist</h2>
<table>
	<thead>
		<tr><th>rule</th><th>why</th></tr>
	</thead>
	<tbody>
		<tr><td>export an options interface</td><td>keeps plugin configuration discoverable and stable.</td></tr>
		<tr><td>export the added context interface</td><td>lets advanced users name or compose the resulting context.</td></tr>
		<tr><td>prefer <code>decorate</code> for static values</td><td>avoids unnecessary per-update work.</td></tr>
		<tr><td>prefer <code>derive</code> for request-scoped values</td><td>keeps async and update-dependent state honest.</td></tr>
		<tr><td>encode dependencies in <code>In</code></td><td>turns wrong install order into a TypeScript error.</td></tr>
		<tr><td>use <code>BotPlugin</code> for bot lifecycle or API hooks</td><td>keeps bot-only extensions installable through <code>.install()</code>.</td></tr>
		<tr><td>avoid <code>any</code> in public types</td><td>preserves YAEBAL's type-flow invariant.</td></tr>
	</tbody>
</table>
