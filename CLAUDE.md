# owlet-tracker

Personal work-tracking tool.

## Structure

- `core/` — domain logic (entries, timers, storage). Keep free of CLI/TUI concerns.
- `cli/` — command-line interface, depends on `core/`.
- `tui/` — terminal UI, depends on `core/`.

## Notes

- No stack chosen yet. Ask before introducing a language, framework, or package manager.
- `cli/` and `tui/` are consumers of `core/`; dependencies never point the other way.
