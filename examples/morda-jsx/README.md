# @yaebal/example-morda-jsx (a runnable bot)

a menu bot built entirely from jsx screens (`@yaebal/morda/jsx`): react-style hooks with
persisted state, a dialog-wide data bag shared across screens, ready-made widgets
(`Toggle` / `Select` / `Counter` / `Pagination`), free-text input via `<Screen onText>`,
and typed navigation by component (`nav.push(Settings)`).

## running

```sh
cp examples/morda-jsx/.env.example examples/morda-jsx/.env   # then add your token
pnpm --filter @yaebal/example-morda-jsx dev
```

- dev / run once: `pnpm --filter @yaebal/example-morda-jsx dev` (or `start` — same thing here)

both load `examples/morda-jsx/.env`. unlike the other examples this one compiles with `tsc`
before running — node's type stripping does not transform jsx, so there is no watch-reload;
re-run the command after edits.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command  | what it shows                                       |
|:---------|:----------------------------------------------------|
| `/start` | opens the main screen (tap counter + navigation)    |

everything else happens on the buttons:

- **tap me** — `useState` in action: the counter is persisted in the dialog frame, and any
  number of `setState` calls in one handler still produce a single message edit.
- **⚙️ settings** — `useDialogData` shared across screens, a `Toggle` for dark mode, a
  three-column `Select` for the language, a clamped `Counter` for volume. while this screen
  is on top, any text you send becomes your display name (`<Screen onText>`).
- **💡 tips** — `nav.push(Tips, { startAt: 1 })` + `useParams`, a `Pagination` pager, and a
  mount `useEffect` that flips "warming up…" into content *after* the message is delivered —
  the load-then-show pattern.

restart the bot mid-dialog and keep tapping: with a persistent storage adapter the hook
state lives in the dialog frames, so the menu picks up exactly where it left off (the
in-memory default used here forgets on restart — swap it via `jsxDialogs(screens, { storage })`).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
