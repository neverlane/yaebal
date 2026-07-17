# yaebal agent skills

source of truth for the agent playbooks distributed by the `@yaebal/ai` installer.
each `<skill>/SKILL.md` teaches an AI coding agent (Claude Code, Cursor, Codex, …) one
recurring task in an **end user's bot project** — writing bots *with* yaebal, not developing
yaebal itself. the installer ships them verbatim as Claude Code plugin skills and converts
them into Cursor rules / AGENTS.md sections.

format: YAML frontmatter (`name: yaebal-<slug>`, `description` starting with "Use when") +
a self-contained playbook. verify every identifier against `packages/<name>/src` when editing.
