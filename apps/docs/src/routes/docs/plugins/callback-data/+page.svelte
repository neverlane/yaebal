<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/callback-data`;

	const usage = `import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { callbackData, field } from "@yaebal/callback-data";

// a namespace: a prefix + a field schema
const user = callbackData("user", {
  id: Number,                                  // required scalar (shorthand)
  action: field.enum(["ban", "kick", "mute"]), // union type, one char on the wire
  note: field.string().optional(),             // may be absent
  page: field.number().default(1),             // absent → filled with 1
});

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("manage", (ctx) =>
  ctx.reply("choose:", {
    reply_markup: new InlineKeyboard()
      .text("ban", user.pack({ id: 42, action: "ban" }))
      .text("kick", user.pack({ id: 42, action: "kick", note: "spam" }))
      .build(),
  }),
);

// pass the namespace itself: the payload is validated + decoded to ctx.queryData,
// and this handler runs only on a clean unpack
bot.callbackQuery(user, (ctx) => {
  const { id, action, page } = ctx.queryData; // fully typed
  return ctx.reply(\`\${action} \${id} (page \${page})\`);
});`;

	const patternUsage = `// prefer passing the namespace (typed ctx.queryData). when you need the raw regex —
// e.g. to route several namespaces through one handler — use .pattern + .unpack:
bot.callbackQuery(user.pattern, (ctx) => {
  const payload = user.unpack(ctx.callbackQuery.data ?? "");
  if (!payload) return; // foreign or outdated data
  // payload is fully typed
});`;

	const evolution = `// appending an optional field (or an enum member) keeps old buttons working
const v1 = callbackData("p", { id: Number });
const v2 = callbackData("p", { id: Number, note: field.string().optional() });

v2.unpack(v1.pack({ id: 7 })); // => { id: 7 } — a button packed by v1 still decodes`;

	const prefixOnly = `// a namespace with no fields — useful for simple action buttons
const ping = callbackData("ping", {});
ping.pack();         // => "ping"
ping.unpack("ping"); // => {}
ping.filter("ping"); // => true`;
</script>

<svelte:head>
	<title>@yaebal/callback-data — yaebal</title>
</svelte:head>

<h1>@yaebal/callback-data</h1>
<p class="lead">typed <code>callback_data</code> — pack and unpack button payloads with a compact, byte-aware wire format and full type inference.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	call <code>callbackData(prefix, schema)</code> once per namespace. bare
	<code>Number</code>, <code>String</code> and <code>Boolean</code> are shorthand for required
	scalars; the <code>field</code> builders add enums, optionals and defaults. types are
	inferred — <code>pack</code>, <code>unpack</code> and <code>ctx.queryData</code> all carry
	the exact shape.
</p>
<Code code={usage} title="bot.ts" />

<h2>routing on the raw pattern</h2>
<p>
	passing the namespace to <code>callbackQuery</code> is the typed path. when you need the raw
	regex instead, route on <code>.pattern</code> and call <code>.unpack</code> yourself:
</p>
<Code code={patternUsage} title="pattern.ts" />

<h2>schema evolution</h2>
<p>
	appending an <strong>optional</strong> field — or appending a member to an
	<code>field.enum</code> — is backward-compatible: buttons packed before the change still
	<code>unpack</code>. adding a required field, reordering, or changing a field's type breaks
	old buttons.
</p>
<Code code={evolution} title="evolution.ts" />

<h2>prefix-only schema</h2>
<p>pass an empty schema <code>&#123;&#125;</code> for buttons that carry no payload:</p>
<Code code={prefixOnly} title="prefix-only.ts" />

<h2>fields</h2>
<table>
	<thead>
		<tr><th>codec</th><th>wire form</th><th>TypeScript type</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>Number</code> / <code>field.number()</code></td>
			<td>base36 integer, decimal fallback</td>
			<td><code>number</code></td>
		</tr>
		<tr>
			<td><code>String</code> / <code>field.string()</code></td>
			<td>raw utf-8, only <code>:</code> / <code>\</code> escaped</td>
			<td><code>string</code></td>
		</tr>
		<tr>
			<td><code>Boolean</code> / <code>field.boolean()</code></td>
			<td><code>1</code> / <code>0</code></td>
			<td><code>boolean</code></td>
		</tr>
		<tr>
			<td><code>field.enum([...])</code></td>
			<td>member index (base36)</td>
			<td>union of the members</td>
		</tr>
		<tr>
			<td><code>field.uuid()</code></td>
			<td>22 base64url chars (down from 36)</td>
			<td><code>string</code></td>
		</tr>
		<tr>
			<td><code>field.bigint()</code></td>
			<td>base36 — lossless for 64-bit ids</td>
			<td><code>bigint</code></td>
		</tr>
	</tbody>
</table>
<p>
	any field chains <code>.optional()</code> (absent → <code>undefined</code> on unpack) and
	<code>.default(v)</code> (absent → <code>v</code> on unpack, optional in the packed input).
</p>
<p>
	<code>field.uuid()</code> is for database keys (postgres/supabase/prisma defaults): a raw
	uuid is 36 bytes — over half the budget — so it's repacked into 16 raw bytes + base64url.
	<code>field.number()</code> refuses integers beyond <code>Number.MAX_SAFE_INTEGER</code>
	(they can't round-trip exactly through a js <code>number</code>); <code>field.bigint()</code>
	is the lossless home for 64-bit ids.
</p>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>callbackData</code></td>
			<td><code>(prefix, schema, options?) =&gt; CallbackData&lt;S&gt;</code></td>
			<td>creates a typed callback_data namespace; <code>options.maxBytes</code> overrides the 64-byte guard</td>
		</tr>
		<tr>
			<td><code>field</code></td>
			<td><code>&#123; string, number, boolean, enum, uuid, bigint &#125;</code></td>
			<td>field builders, each chainable with <code>.optional()</code> / <code>.default(v)</code></td>
		</tr>
	</tbody>
</table>

<h3>CallbackData&lt;S&gt;</h3>
<table>
	<thead>
		<tr><th>member</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>pack</code></td>
			<td><code>(data: InferInput&lt;S&gt;) =&gt; string</code></td>
			<td>serialize a payload; throws if it exceeds the byte limit</td>
		</tr>
		<tr>
			<td><code>unpack</code></td>
			<td><code>(raw: string) =&gt; InferOutput&lt;S&gt; | undefined</code></td>
			<td>parse a raw string; <code>undefined</code> for any data that isn't valid for this namespace (never throws)</td>
		</tr>
		<tr>
			<td><code>filter</code></td>
			<td><code>(raw: string | undefined) =&gt; boolean</code></td>
			<td>cheap prefix check; safe to pass <code>undefined</code></td>
		</tr>
		<tr>
			<td><code>pattern</code></td>
			<td><code>RegExp</code></td>
			<td>regex anchored to the prefix — pass to <code>bot.callbackQuery()</code></td>
		</tr>
		<tr>
			<td><code>extend</code></td>
			<td><code>(extra: E) =&gt; CallbackData&lt;…&gt;</code></td>
			<td>derive a new namespace with extra fields appended (immutable)</td>
		</tr>
	</tbody>
</table>

<div class="note">
	<strong>Telegram caps <code>callback_data</code> at 64 bytes.</strong> the wire format is
	built to be small — base36 numbers, one-byte booleans, enum indices, raw utf-8 strings — and
	<code>pack</code> throws early if a payload still overflows.
	<br /><br />
	<strong>the prefix must not contain <code>:</code> or <code>\</code></strong> — both are
	reserved by the wire format, and <code>callbackData</code> throws immediately if it does.
	<br /><br />
	<strong>routing on the namespace runs the handler only on a clean unpack</strong>, so there is
	no gap between <code>filter</code> and <code>unpack</code> — outdated or hostile data simply
	falls through.
</div>
