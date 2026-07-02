# changesets

this folder is managed by [changesets](https://github.com/changesets/changesets).

- `pnpm changeset` — record a change (pick packages + bump type, write a summary).
- `pnpm version-packages` — apply pending changesets: bump versions + write changelogs.
- `pnpm release` — build everything, then `changeset publish` to npm.

`@yaebal/docs` and `@yaebal/example-*` are ignored (never published).
