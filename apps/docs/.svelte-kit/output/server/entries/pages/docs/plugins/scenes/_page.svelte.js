import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/scenes`;
  const usage = `import { Bot } from "@yaebal/core";
import { scenes } from "@yaebal/scenes";
import type { SceneContext, SceneDef } from "@yaebal/scenes";

const defs: Record<string, SceneDef> = {
  registration: {
    // enter is called once when the scene starts — ask the first question here
    enter: async (ctx) => {
      await ctx.reply("What is your name?");
    },
    steps: [
      // step 0: receives the name, asks for age, advances
      async (ctx: SceneContext) => {
        const name = ctx.text ?? "";
        await ctx.reply(\`Nice to meet you, \${name}! How old are you?\`);
        ctx.scene.next(); // advance to step 1
      },
      // step 1: receives the age, finishes
      async (ctx: SceneContext) => {
        const age = ctx.text ?? "";
        await ctx.reply(\`Got it — \${age} years old. Registration complete!\`);
        await ctx.scene.leave();
      },
    ],
  },
};

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(scenes(defs));

bot.command("register", (ctx) => ctx.scene.enter("registration"));
bot.start();`;
  const validation = `// a step that does NOT call ctx.scene.next() re-runs on the next message
// use this for validation loops

const defs: Record<string, SceneDef> = {
  ask: {
    enter: async (ctx) => ctx.reply("Enter a number between 1 and 10:"),
    steps: [
      async (ctx: SceneContext) => {
        const n = Number(ctx.text);
        if (n >= 1 && n <= 10) {
          await ctx.reply(\`You chose \${n}.\`);
          return ctx.scene.leave();
        }
        // no next() → step 0 runs again on the next message
        await ctx.reply("That is not in range. Try again:");
      },
    ],
  },
};`;
  const switchScene = `// a step can switch to another scene entirely via ctx.scene.enter()
const defs: Record<string, SceneDef> = {
  a: {
    steps: [
      async (ctx: SceneContext) => {
        await ctx.reply("switching to scene b");
        await ctx.scene.enter("b"); // jumps to scene b, step 0
      },
    ],
  },
  b: {
    steps: [
      async (ctx: SceneContext) => {
        await ctx.reply("done in scene b");
        return ctx.scene.leave();
      },
    ],
  },
};`;
  const cancel = `// while in a scene all messages are consumed — /cancel won't fire its
// command handler. check for it inside the step if you want an escape hatch.
async (ctx: SceneContext) => {
  if (ctx.text === "/cancel") {
    await ctx.reply("Cancelled.");
    return ctx.scene.leave();
  }
  // normal step logic...
  ctx.scene.next();
}`;
  const customStorage = `import { scenes } from "@yaebal/scenes";

bot.install(scenes(defs, {
  storage: myPersistentStorage, // StorageAdapter<{ scene: string; step: number }>
  getKey: (ctx) => ctx.from?.id?.toString(), // partition by user instead of chat
}));`;
  head("d6oasn", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/scenes — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/scenes</h1> <p class="lead">step-by-step wizards over multiple messages. each step handles one incoming message; calling <code>ctx.scene.next()</code> advances to the next step on the following message. <code>ctx.scene.leave()</code> exits and restores normal handler routing.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>define your scenes as a <code>Record&lt;string, SceneDef></code>, pass them to <code>scenes()</code>, and install the plugin with <code>.install()</code>. enter a scene from
	any handler with <code>ctx.scene.enter(name)</code>.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>scenes</code></td><td><code>(defs, options?) => Plugin&lt;Context, { scene: SceneControl }></code></td><td>creates the scenes plugin</td></tr><tr><td><code>SceneDef</code></td><td>interface</td><td><code>{ enter?: Step; steps: Step[] }</code></td></tr><tr><td><code>SceneContext</code></td><td><code>Context &amp; { scene: SceneControl }</code></td><td>context type inside steps and the enter hook</td></tr><tr><td><code>SceneControl</code></td><td>interface</td><td>the control object on <code>ctx.scene</code></td></tr><tr><td><code>ScenesOptions</code></td><td>interface</td><td>options passed to <code>scenes()</code></td></tr><tr><td><code>Step</code></td><td><code>(ctx: SceneContext) => unknown | Promise&lt;unknown></code></td><td>a single step handler</td></tr></tbody></table> <h3>SceneControl (ctx.scene)</h3> <table><thead><tr><th>member</th><th>type</th><th>description</th></tr></thead><tbody><tr><td><code>enter(name)</code></td><td><code>(name: string) => Promise&lt;void></code></td><td>enter a scene; runs its <code>enter</code> hook and sets step to 0</td></tr><tr><td><code>next()</code></td><td><code>() => void</code></td><td>advance the step counter; the new step runs on the next message</td></tr><tr><td><code>leave()</code></td><td><code>() => Promise&lt;void></code></td><td>exit the scene; subsequent messages fall through to normal handlers</td></tr><tr><td><code>current</code></td><td><code>string | undefined</code></td><td>the active scene name, or <code>undefined</code> if not in a scene</td></tr><tr><td><code>step</code></td><td><code>number</code></td><td>the current step index (0-based)</td></tr></tbody></table> <h3>ScenesOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>storage</code></td><td><code>StorageAdapter&lt;{ scene: string; step: number }></code></td><td>no</td><td>where to persist scene state. defaults to <code>MemoryStorage</code> (lost on restart)</td></tr><tr><td><code>getKey</code></td><td><code>(ctx: Context) => string | undefined</code></td><td>no</td><td>storage key for the update. defaults to <code>ctx.chat?.id?.toString()</code></td></tr></tbody></table> <h2>validation loops</h2> <p>a step that does not call <code>ctx.scene.next()</code> re-runs on the next message — use this
	to ask again on invalid input.</p> `);
  Code($$renderer, { code: validation, title: "validation.ts" });
  $$renderer.push(`<!----> <h2>switching scenes from a step</h2> <p>a step can call <code>ctx.scene.enter()</code> to jump to a different scene entirely.</p> `);
  Code($$renderer, { code: switchScene, title: "switch-scene.ts" });
  $$renderer.push(`<!----> <h2>custom storage and key</h2> `);
  Code($$renderer, { code: customStorage, title: "custom-storage.ts" });
  $$renderer.push(`<!----> <h2>escape hatch for commands</h2> `);
  Code($$renderer, { code: cancel, title: "cancel.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>scene messages are consumed.</strong> while a user is in a scene, every incoming message
	is handled by the current step and never reaches other handlers — including command handlers.
	build an in-step escape check (<code>if (ctx.text === "/cancel")</code>) if you need one. <br/><br/> <strong>steps run on messages only.</strong> the scene interceptor only fires when <code>ctx.message</code> is present. callback queries, inline queries, and other update types
	pass through to normal handlers even while a scene is active. <br/><br/> <strong>advancing past the last step auto-leaves.</strong> if after calling <code>next()</code> the step index reaches or exceeds the length of <code>steps</code>, the
	scene exits automatically without needing an explicit <code>leave()</code>. <br/><br/> <strong>state is in-memory by default.</strong> pass a persistent <code>StorageAdapter</code> to survive restarts — the same interface used by <code>@yaebal/session</code>.</div>`);
}
export {
  _page as default
};
