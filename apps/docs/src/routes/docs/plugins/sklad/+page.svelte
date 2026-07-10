<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/sklad`;

	const usage = `import { session } from "@yaebal/session";
import { scenes } from "@yaebal/scenes";
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis";

const redis = new Redis();

bot
  .install(session({
    initial: () => ({ count: 0 }),
    storage: redisStorage(redis, { prefix: "session:" }),
  }))
  .install(scenes(defs, {
    storage: redisStorage(redis, { prefix: "scenes:", ttl: 30 * 60_000 }),
  }));`;

	const memory = `import { MemoryStorage } from "@yaebal/sklad";

// the default everywhere — now with knobs
const cache = new MemoryStorage<Profile>({
  ttl: 10 * 60_000, // expire entries 10 min after the last write/touch
  max: 5_000,       // lru-cap the map
  clone: true,      // default: values are structured-cloned, like a real serializer would
});`;

	const sqlite = `import { DatabaseSync } from "node:sqlite"; // or better-sqlite3
import { sqliteStorage } from "@yaebal/sklad";

const db = new DatabaseSync("bot.db");

bot.install(session({
  initial: () => ({ count: 0 }),
  storage: sqliteStorage(db, { table: "sessions" }),
}));`;

	const file = `import { fileStorage } from "@yaebal/sklad/file";

// zero-infrastructure persistence for small bots: one json document on disk,
// atomic writes (tmp + rename), one instance per path
bot.install(session({
  initial: () => ({ count: 0 }),
  storage: fileStorage("./data/sessions.json"),
}));`;

	const kv = `import { kvStorage } from "@yaebal/sklad";

// cloudflare workers: pass the kv binding from your env
export default {
  fetch(request, env) {
    const storage = kvStorage(env.BOT_KV, { prefix: "session:" });
    // … webhookCallback(bot) with session({ storage })
  },
};`;

	const custom = `import type { StorageAdapter } from "@yaebal/sklad";

// anything with get/set/delete is an adapter — has/touch are optional capabilities
const postgres: StorageAdapter<Session> = {
  get: (key) => sql\`SELECT value FROM kv WHERE key = \${key}\`.then(rowToValue),
  set: (key, value) => sql\`INSERT … ON CONFLICT …\`,
  delete: (key) => sql\`DELETE FROM kv WHERE key = \${key}\`,
};`;
</script>

<svelte:head>
	<title>@yaebal/sklad — yaebal</title>
</svelte:head>

<h1>@yaebal/sklad</h1>
<p class="lead">
	the storage contract shared by the yaebal ecosystem — <code>@yaebal/session</code>,
	<code>@yaebal/scenes</code> and friends all persist through one
	<code>StorageAdapter&lt;T&gt;</code> interface — plus zero-dependency adapters for the usual
	suspects. every adapter takes an <em>already-constructed</em> client and types it structurally,
	so sklad depends on nothing and never dictates a driver version.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	construct an adapter, hand it to any plugin that takes <code>storage</code>. prefixes keep
	several plugins (or several bots) apart in one shared backend.
</p>
<Code code={usage} title="bot.ts" />

<h2>adapters</h2>
<table>
	<thead>
		<tr><th>adapter</th><th>backend</th><th>ttl</th><th>notes</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>new MemoryStorage(opts?)</code></td>
			<td>in-process map</td>
			<td>lazy, per entry</td>
			<td>the default everywhere. <code>clone</code> isolation, <code>max</code> lru cap</td>
		</tr>
		<tr>
			<td><code>redisStorage(client, opts?)</code></td>
			<td>ioredis / node-redis v4+ (<code>RedisLike</code>)</td>
			<td>native <code>EXPIRE</code>, sliding via <code>touch</code></td>
			<td><code>prefix</code>, custom <code>serializer</code></td>
		</tr>
		<tr>
			<td><code>sqliteStorage(db, opts?)</code></td>
			<td>node:sqlite / better-sqlite3 (<code>SqliteLike</code>)</td>
			<td>lazy, per row</td>
			<td>creates its <code>table</code> on first use; synchronous, no event-loop hops</td>
		</tr>
		<tr>
			<td><code>kvStorage(kv, opts?)</code></td>
			<td>cloudflare workers kv (<code>KVNamespaceLike</code>)</td>
			<td>native <code>expirationTtl</code> (60s minimum)</td>
			<td>per-write expiry — kv has no cheap refresh, so no <code>touch</code></td>
		</tr>
		<tr>
			<td><code>fileStorage(path, opts?)</code></td>
			<td>one json document (<code>@yaebal/sklad/file</code> subpath)</td>
			<td>lazy, per entry</td>
			<td>atomic tmp+rename writes; one instance owns one path</td>
		</tr>
	</tbody>
</table>

<h2>memory: ttl, lru, clone</h2>
<Code code={memory} title="memory.ts" />

<h2>sqlite</h2>
<Code code={sqlite} title="sqlite.ts" />

<h2>json file</h2>
<Code code={file} title="file.ts" />

<h2>cloudflare kv</h2>
<Code code={kv} title="worker.ts" />

<h2>the contract</h2>
<p>
	<code>get</code> / <code>set</code> / <code>delete</code> are required; <code>has</code> and
	<code>touch</code> are optional capabilities — <code>touch</code> refreshes a key's ttl without
	rewriting the value, which callers use for sliding expiry when the adapter advertises it.
	values round-trip through a <code>Serializer</code> (default <code>JSON</code>), so keep them
	plain data.
</p>
<Code code={custom} title="custom-adapter.ts" />

<div class="note">
	<strong>ttl is milliseconds everywhere</strong> — adapters convert to their backend's unit
	(redis seconds, kv <code>expirationTtl</code>) and round up. cloudflare kv enforces a 60-second
	minimum.
	<br /><br />
	<strong>structural clients.</strong> <code>RedisLike</code> / <code>SqliteLike</code> /
	<code>KVNamespaceLike</code> describe only the handful of methods the adapters call, so any
	compatible client works and sklad ships zero dependencies.
</div>

<h2>related</h2>
<p>
	<a href="/docs/plugins/session">@yaebal/session</a> — per-chat state on top of these adapters ·
	<a href="/docs/plugins/scenes">@yaebal/scenes</a> — durable wizards whose snapshots live here ·
	<a href="/docs/production/deploy-targets">deploy targets</a> — which adapter fits which runtime.
</p>
