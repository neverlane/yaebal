# @yaebal/panel

## 2.0.1

### patch changes

- updated dependencies [d9e233a]
  - @yaebal/core@0.4.4

## 2.0.0

### major changes

- breaking: prompt keys pending prompts per user per chat (in groups only the asked member answers — pass getKey: (ctx) => ctx.chat?.id.toString() for the old shared prompt) and ignores edits as answers. onboarding scopes flows to the bot they're installed on, gives each flow its own default storage, and exitAll() no longer opts the user out (use disableAll()). commands runs scoped handlers only inside their scope (admin scopes check getChatMember); outside it the unscoped handler runs or the update moves on. panel no longer reads the forgeable x-panel-remote-addr header — @yaebal/panel/serve passes the socket address out of band, elsewhere pass clientKey or trustProxy; panel edits/deletes are stamped with the operator, files are served inertly, group sends are recorded and groups are named by their title. broadcast: client.sendMessage/queueMessage take BroadcastMessageOptions (concurrency/rateLimit stay on the client and the one-shot broadcast()); per-job onEvent and storeResults work, a pause during job creation holds, rate-limited waiters no longer burst, and the memory store keeps the last 1000 finished jobs.

### patch changes

- updated dependencies
  - @yaebal/core@0.4.3

## 1.0.2

### patch changes

- updated dependencies [46920ed]
- updated dependencies [1ebbb05]
  - @yaebal/core@0.4.2

## 1.0.1

### patch changes

- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
  - @yaebal/core@0.4.1

## 1.0.0

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
