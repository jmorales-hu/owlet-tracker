# owlet-tracker

A personal work-tracking tool.

> **Status:** early scaffolding. The design is settled (see [CONTEXT.md](CONTEXT.md));
> the layout below is the intended shape of the project, not working code yet.

## Layout

| Path               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `core/`            | The Store: Thread trees, Map graph, Frontier, cycle detection.    |
| `cli/`             | The `owlet` binary on top of `core/`. Sole writer to the Store.   |
| `tui/`             | Terminal UI (Ink) on top of `core/`. Read-only.                   |
| `skills/`          | The `owlet` plugin's skills — judgement and acting.               |

## Getting started

Nothing to run yet. The stack is TypeScript on [Bun](https://bun.sh), with
[Ink](https://github.com/vadimdemedes/ink) for the TUI; build and run instructions go
here once there is something to build.

## License

MIT — see [LICENSE](LICENSE).
