<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/session`;

	const storage = `import { redisStorage } from "@yaebal/sklad";
import { session } from "@yaebal/session";

bot.install(session({
  initial: () => ({ count: 0 }),
  storage: redisStorage(redis, {
    prefix: "session:",
    ttl: 24 * 60 * 60_000, // sliding: refreshed on every write and touch
  }),
}));`;

	const customStorage = `import type { StorageAdapter } from "@yaebal/sklad";

// three required methods; \`has\`/\`touch\` are optional capabilities
class MyStorage<T> implements StorageAdapter<T> {
  async get(key: string): Promise<T | undefined> { /* … */ }
  async set(key: string, value: T): Promise<void> { /* … */ }
  async delete(key: string): Promise<void> { /* … */ }
}`;

	const keys = `import { keyBy, session } from "@yaebal/session";

session({ initial, getKey: keyBy.chat });       // default: one session per chat
session({ initial, getKey: keyBy.user });       // per user — also covers inline queries
session({ initial, getKey: keyBy.chatUser });   // per user per chat
session({ initial, getKey: keyBy.chatThread }); // per forum topic

// custom: async, and composite descriptors normalize to stable keys —
// { chat: 42, user: 7 } → "user:7:chat:42"
session({
  initial,
  getKey: (ctx) => ({ chat: ctx.chat?.id, key: "quiz" }),
});`;

	const multi = `bot
  .install(session({ key: "chatState", initial: () => ({ topic: "" }) }))
  .install(session({
    key: "userState",
    getKey: keyBy.user,
    initial: () => ({ visits: 0 }),
  }));

bot.on("message", (ctx) => {
  ctx.chatState.topic = "pricing"; // typed { topic: string }
  ctx.userState.visits++;          // typed { visits: number }
});`;

	const lazy = `import { lazySession } from "@yaebal/session";

bot.install(lazySession({ initial: () => ({ count: 0 }) }));

bot.on("message", async (ctx) => {
  const session = await ctx.session; // ← the only storage read, and only if you get here
  session.count++;                   // tracked exactly like the eager variant
});`;

	const clearing = `import { clearSession, saveSession } from "@yaebal/session";

bot.command("reset", async (ctx) => {
  await clearSession(ctx); // delete from storage + fresh initial()
});

bot.command("checkout", async (ctx) => {
  ctx.session.step = "paying";
  await saveSession(ctx); // flush now, before the risky long call
  await startPayment(ctx);
});

// multi-session setups pass the field name:
await clearSession(ctx, "userState");`;

	const ttlFields = `import { ttl, unwrapTtl, type TtlValue } from "@yaebal/session";

interface MySession {
  otp?: TtlValue<string>;
}

ctx.session.otp = ttl("1234", 60_000);   // valid for a minute
const code = unwrapTtl(ctx.session.otp); // string | undefined

// expired fields are also deleted from storage on the next load`;

	const migrations = `session<{ fullName: string; visits: number }>({
  initial: () => ({ fullName: "", visits: 0 }),
  migrations: {
    // versions start at 1 and must be gapless; pre-migration records count as 0
    1: (old) => ({ fullName: (old as { name: string }).name }),
    2: (v1) => ({ ...(v1 as { fullName: string }), visits: 0 }),
  },
});`;

	const testing = `import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage, session } from "@yaebal/session";
import { createTestEnv } from "@yaebal/test";

const storage = new MemoryStorage<{ count: number }>();
const bot = new Composer<Context>()
  .install(session({ initial: () => ({ count: 0 }), storage }))
  .command("count", (ctx) => ctx.reply(\`#\${++ctx.session.count}\`));

const env = createTestEnv(bot);
const user = env.createUser();
await user.sendCommand("count");
// assert on storage contents — the observable behavior
assert.equal(storage.get(String(user.chat.id))?.count, 1);`;
</script>

<svelte:head>
	<title>@yaebal/session — yaebal</title>
</svelte:head>

<h1>@yaebal/session</h1>
<p class="lead">
	typed session state: loaded before your handlers, persisted after — but only when it actually
	changed. per-chat by default, per-anything via key strategies, with lazy loading, multiple
	independent sessions, schema migrations and self-expiring fields.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>session()</code> is a plugin — pass it to <code>.install()</code> on a bot or composer.
	<code>initial</code> is required, so <code>ctx.session</code> is always <code>S</code>, never
	<code>S | undefined</code>; the context type is augmented automatically, no declaration merging.
</p>
<Try id="session-counter" title="session.ts" />

<h2>dirty-checked saves</h2>
<p>
	a save is skipped when the state is byte-identical to what was loaded. deep mutations count —
	dirtiness is a serialized-snapshot comparison, not a proxy, so there is no class of "mutation
	the proxy didn't see" (<code>Map</code>/<code>Set</code>/<code>Date</code> tricks aside: keep
	sessions plain json data). untouched fresh sessions are never written at all — lurkers in big
	groups don't fill your storage with <code>initial()</code> records. opt out with
	<code>alwaysSave: true</code>.
</p>
<p>
	when the adapter advertises <code>touch</code> (redis/sqlite/file/memory with <code>ttl</code>),
	an unchanged read refreshes the ttl instead — sessions live as long as the chat is active.
</p>

<h2>storage</h2>
<p>
	defaults to a cloning in-memory store. bring any adapter from
	<a href="/docs/plugins/sklad">@yaebal/sklad</a> — redis, sqlite, cloudflare kv, a json file —
	or implement the interface yourself:
</p>
<Code code={storage} title="redis.ts" />
<Code code={customStorage} title="custom-storage.ts" />

<h2>key strategies</h2>
<p>
	<code>getKey</code> decides the storage partition. it may be async, return a plain string, a
	composite descriptor, or <code>undefined</code> for "no session on this update".
</p>
<Code code={keys} title="keys.ts" />
<p>
	updates that yield no key (a <code>poll</code> update; an inline query under the per-chat
	default) get a working <em>throwaway</em> session that is silently dropped. pick a different
	behavior with <code>onMissingKey</code>: <code>"skip"</code> leaves the field off the context,
	<code>"error"</code> throws a <code>SessionError</code> so the gap can't hide.
</p>

<h2>multiple sessions</h2>
<p>
	give installs distinct <code>key</code> names — each gets its own field, storage and partition,
	and the types flow for both. two installs sharing one field fail loud at runtime. (annotate
	<code>initial</code>'s return type instead of passing explicit generics — then both the state
	type and the field name infer.)
</p>
<Code code={multi} title="multi.ts" />

<h2>lazy sessions</h2>
<p>
	<code>lazySession</code> defers the storage read until the first
	<code>await ctx.session</code> — handlers that never touch the session cost zero storage
	round-trips, and the final flush is skipped entirely if the session was never loaded.
</p>
<Code code={lazy} title="lazy.ts" />

<h2>clearing and flushing</h2>
<Code code={clearing} title="control.ts" />
<Try id="session-v2" title="session-v2.ts" />

<h2>self-expiring fields</h2>
<p>
	<code>ttl()</code> wraps a value with its own expiry; expired fields are deleted on the next
	load. explicit by design — the envelope is visible in your session type, no proxy magic.
</p>
<Code code={ttlFields} title="ttl.ts" />

<h2>migrations</h2>
<p>
	change the session shape without wiping old data. migrated records are re-persisted
	immediately (wrapped in a small version envelope), so each record upgrades exactly once.
</p>
<Code code={migrations} title="migrations.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>session</code></td>
			<td><code>(options: SessionOptions&lt;S, K&gt;) =&gt; Plugin&lt;Context, Record&lt;K, S&gt;&gt;</code></td>
			<td>eager session plugin (default field <code>"session"</code>)</td>
		</tr>
		<tr>
			<td><code>lazySession</code></td>
			<td><code>(options: SessionOptions&lt;S, K&gt;) =&gt; Plugin&lt;Context, Record&lt;K, Promise&lt;S&gt;&gt;&gt;</code></td>
			<td>reads storage only on first <code>await ctx.session</code></td>
		</tr>
		<tr>
			<td><code>clearSession</code></td>
			<td><code>(ctx, key?) =&gt; Promise&lt;void&gt;</code></td>
			<td>delete from storage + reset to <code>initial()</code></td>
		</tr>
		<tr>
			<td><code>saveSession</code></td>
			<td><code>(ctx, key?) =&gt; Promise&lt;void&gt;</code></td>
			<td>flush to storage immediately</td>
		</tr>
		<tr>
			<td><code>keyBy</code></td>
			<td><code>chat · user · chatUser · chatThread</code></td>
			<td>ready-made <code>getKey</code> strategies</td>
		</tr>
		<tr>
			<td><code>ttl</code> / <code>unwrapTtl</code></td>
			<td><code>ttl(value, ms)</code> / <code>unwrapTtl(wrapped)</code></td>
			<td>self-expiring session fields (<code>TtlValue&lt;T&gt;</code>)</td>
		</tr>
		<tr>
			<td><code>SessionError</code></td>
			<td><code>class extends Error</code></td>
			<td>every failure mode of this plugin</td>
		</tr>
		<tr>
			<td><code>MemoryStorage</code> / <code>StorageAdapter</code></td>
			<td>re-exported from <a href="/docs/plugins/sklad">@yaebal/sklad</a></td>
			<td>kept here for compatibility</td>
		</tr>
	</tbody>
</table>

<h3>SessionOptions&lt;S, K = "session"&gt;</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>initial</code></td>
			<td><code>(ctx: Context) =&gt; S</code></td>
			<td>required</td>
			<td>fresh state when nothing is stored; receives the context</td>
		</tr>
		<tr>
			<td><code>storage</code></td>
			<td><code>StorageAdapter&lt;S&gt;</code></td>
			<td><code>new MemoryStorage()</code></td>
			<td>any <a href="/docs/plugins/sklad">sklad</a> adapter</td>
		</tr>
		<tr>
			<td><code>getKey</code></td>
			<td><code>(ctx) =&gt; string | SessionKey | undefined</code> (may be async)</td>
			<td><code>keyBy.chat</code></td>
			<td>storage partition per update</td>
		</tr>
		<tr>
			<td><code>key</code></td>
			<td><code>K extends string</code></td>
			<td><code>"session"</code></td>
			<td>the context field — distinct names give independent sessions</td>
		</tr>
		<tr>
			<td><code>alwaysSave</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>persist even when nothing changed</td>
		</tr>
		<tr>
			<td><code>onMissingKey</code></td>
			<td><code>"throwaway" | "skip" | "error"</code></td>
			<td><code>"throwaway"</code></td>
			<td>behavior when <code>getKey</code> yields no key</td>
		</tr>
		<tr>
			<td><code>migrations</code></td>
			<td><code>Record&lt;number, (data: unknown) =&gt; unknown&gt;</code></td>
			<td>—</td>
			<td>versioned schema upgrades, gapless from 1</td>
		</tr>
	</tbody>
</table>

<h2>error semantics and concurrency</h2>
<div class="note">
	<strong>a throwing handler skips the save</strong> — half-applied state is not persisted. the
	default <code>MemoryStorage</code> clones values, so this guarantee holds in dev exactly like
	it does with redis (a <code>clone: false</code> store can't provide it).
	<br /><br />
	<strong>races.</strong> long polling processes updates sequentially, and
	<a href="/docs/plugins/runner">@yaebal/runner</a> sequentializes per chat — matching the default
	per-chat key. webhook deliveries can run concurrently: updates of one chat may then
	read-modify-write race, like in every session middleware in every framework — keep handlers
	short or serialize per key upstream.
</div>

<h2>testing</h2>
<p>
	pass an explicit <code>MemoryStorage</code> and assert on its contents — storage is the
	observable behavior. (core and session themselves test with a hand-built context; everything
	downstream can use <a href="/docs/plugins/test">@yaebal/test</a> actors.)
</p>
<Code code={testing} title="session.test.ts" />

<h2>related</h2>
<p>
	<a href="/docs/plugins/sklad">@yaebal/sklad</a> — the storage adapters behind this plugin ·
	<a href="/docs/plugins/scenes">@yaebal/scenes</a> — durable wizards ·
	<a href="/docs/plugins/conversation">@yaebal/conversation</a> — linear async dialogs ·
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/session">examples/session</a>
	— a runnable bot showing every feature on this page.
</p>
