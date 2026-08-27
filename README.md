# owlet-tracker

A personal work-tracking tool.

> **Status:** early scaffolding. The stack is not decided yet — the layout below
> is the intended shape of the project, not working code.

## Layout

| Path    | Purpose                                                        |
| ------- | -------------------------------------------------------------- |
| `core/` | Domain logic: entries, timers, storage. No I/O framework tie-in. |
| `cli/`  | Command-line interface on top of `core/`.                        |
| `tui/`  | Terminal UI on top of `core/`.                                   |

## Getting started

Nothing to run yet. Once a stack is chosen, build and run instructions go here.

## License

MIT — see [LICENSE](LICENSE).
