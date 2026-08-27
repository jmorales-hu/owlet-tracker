# owlet-tracker

Personal work-tracking tool.

## Structure

- `core/` — the Store: reading and writing Thread trees, Map graph derivation, Frontier
  computation, cycle detection. Keep free of CLI/TUI concerns.
- `cli/` — the `owlet` binary, depends on `core/`. The only writer to the Store.
- `tui/` — terminal UI (Ink), depends on `core/`. Read-only.
- `.claude-plugin/`, `skills/` — the `owlet` plugin: the skills that do the judgement and
  the acting (Jira, git, status transitions). They call the CLI for every structural write.

## Notes

- Stack: TypeScript on Bun; Ink for the TUI. Ask before introducing any further
  framework or package.
- `cli/` and `tui/` are consumers of `core/`; dependencies never point the other way.
- Vocabulary is defined in `CONTEXT.md`. Use those terms exactly; don't invent synonyms.
- `core/` and `cli/` hold no credentials. Anything touching Jira or git lives in a skill.

## Agent skills

### Issue tracker

GitHub Issues on `jmorales-hu/owlet-tracker`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
