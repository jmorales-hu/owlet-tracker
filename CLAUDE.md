# owlet-tracker

Personal work-tracking tool.

## Structure

- `core/` — domain logic (entries, timers, storage). Keep free of CLI/TUI concerns.
- `cli/` — command-line interface, depends on `core/`.
- `tui/` — terminal UI, depends on `core/`.

## Notes

- No stack chosen yet. Ask before introducing a language, framework, or package manager.
- `cli/` and `tui/` are consumers of `core/`; dependencies never point the other way.

## Agent skills

### Issue tracker

GitHub Issues on `jmorales-hu/owlet-tracker`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
