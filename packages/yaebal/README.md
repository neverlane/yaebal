# yaebal

yaebal — the batteries-included entry point (the gramio idea). re-exports the
core engine, the auto-generated contexts, and the common plugins so a bot needs
a single import. `createBot()` wires the rich per-update contexts (with their
auto-generated shortcut methods) onto every update via the core context factory.

## install

```sh
pnpm add yaebal
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
