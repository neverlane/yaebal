import{a as h,f as p}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as m,e as u,$ as y,n as f}from"../chunks/CILFtpHi.js";import{h as b}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var S=p(`<h1>@yaebal/session</h1> <p class="lead">per-chat session state with a pluggable storage adapter.</p> <h2>install</h2> <!> <h2>usage</h2> <p><code>session()</code> is a plugin — pass it to <code>.install()</code> on a bot or composer.
	it loads <code>ctx.session</code> from storage before your handlers run and writes it back
	after <code>next()</code> resolves. the context type is augmented automatically.</p> <!> <h2>custom storage</h2> <p>the default <code>MemoryStorage</code> is lost on restart. swap it for any object that
	implements <code>StorageAdapter&lt;T&gt;</code>:</p> <!> <h2>per-user sessions</h2> <p>override <code>getKey</code> to change the partition. the default is <code>ctx.chat.id</code>.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>session</code></td><td><code>(options: SessionOptions&lt;S&gt;) =&gt; Plugin&lt;Context, &#123; session: S &#125;&gt;</code></td><td>creates the session plugin</td></tr><tr><td><code>MemoryStorage</code></td><td><code>class MemoryStorage&lt;T&gt; implements StorageAdapter&lt;T&gt;</code></td><td>default in-memory store; lost on restart</td></tr><tr><td><code>StorageAdapter</code></td><td>interface</td><td>implement this to persist sessions externally</td></tr><tr><td><code>SessionOptions</code></td><td>interface</td><td>options passed to <code>session()</code></td></tr></tbody></table> <h3>SessionOptions&lt;S&gt;</h3> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>initial</code></td><td><code>() =&gt; S</code></td><td>yes</td><td>factory called when no stored session exists for the key</td></tr><tr><td><code>storage</code></td><td><code>StorageAdapter&lt;S&gt;</code></td><td>no</td><td>defaults to <code>new MemoryStorage&lt;S&gt;()</code></td></tr><tr><td><code>getKey</code></td><td><code>(ctx: Context) =&gt; string | undefined</code></td><td>no</td><td>defaults to <code>ctx.chat?.id?.toString()</code></td></tr></tbody></table> <h3>StorageAdapter&lt;T&gt;</h3> <table><thead><tr><th>method</th><th>signature</th></tr></thead><tbody><tr><td><code>get</code></td><td><code>(key: string) =&gt; T | undefined | Promise&lt;T | undefined&gt;</code></td></tr><tr><td><code>set</code></td><td><code>(key: string, value: T) =&gt; unknown | Promise&lt;unknown&gt;</code></td></tr><tr><td><code>delete</code></td><td><code>(key: string) =&gt; unknown | Promise&lt;unknown&gt;</code></td></tr></tbody></table> <div class="note"><strong>writes happen unconditionally after <code>next()</code>.</strong> if a handler throws, <code>next()</code> never resolves, so the write is skipped and storage is left untouched —
	the session is not half-saved on error. <br/><br/> <strong>updates without a chat</strong> (e.g. <code>poll</code> updates) receive a throwaway
	session from <code>initial()</code> that is never persisted. <code>getKey</code> returning <code>undefined</code> triggers this path.</div>`,1);function C(a){const n="pnpm add @yaebal/session",i=`import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";

interface MySession {
  count: number;
  lastCommand: string | null;
}

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(session<MySession>({
    initial: () => ({ count: 0, lastCommand: null }),
  }));

// ctx.session is now fully typed as MySession
bot.on("message:text", async (ctx) => {
  ctx.session.count++;
  ctx.session.lastCommand = ctx.text;
  await ctx.reply(\`message #\${ctx.session.count}\`);
});

bot.start();`,c=`import { session, type StorageAdapter } from "@yaebal/session";

// example: a minimal Redis adapter
class RedisStorage<T> implements StorageAdapter<T> {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    return raw ? JSON.parse(raw) : undefined;
  }

  async set(key: string, value: T): Promise<void> {
    await this.redis.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

bot.install(session({
  initial: () => ({ count: 0 }),
  storage: new RedisStorage(redis),
}));`,l=`bot.install(session({
  initial: () => ({ preferences: {} }),
  // partition by user instead of chat
  getKey: (ctx) => ctx.from?.id?.toString(),
}));`;var o=S();b("1yn86bg",x=>{u(()=>{y.title="@yaebal/session — yaebal"})});var s=t(m(o),6);e(s,{code:n,title:"terminal",lang:"sh"});var d=t(s,6);e(d,{code:i,title:"bot.ts"});var r=t(d,6);e(r,{code:c,title:"redis-storage.ts"});var g=t(r,6);e(g,{code:l,title:"per-user.ts"}),f(14),h(a,o)}export{C as component};
