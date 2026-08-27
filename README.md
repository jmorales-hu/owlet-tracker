# owlet-tracker

A personal system for tracking work that originates as Jira tickets. It holds the working
state of that work as markdown on disk, and renders the shape of it — especially the
blocking graph of a Map — so progress is visible at a glance.

The vocabulary below (Thread, Route, Map, Ticket, Blocker, Frontier) is defined precisely in
[CONTEXT.md](CONTEXT.md). This guide assumes those terms.

## Install

Requires [Bun](https://bun.sh).

```
bun install
bun run build
```

That compiles a standalone binary to `dist/owlet`. Put it on your `PATH`, or call it by
path. During development you can skip the build and run the entrypoint directly with
`bun cli/src/bin.ts <command>`.

Run `owlet` with no arguments for the full command list.

## The Store

Every Thread lives as markdown under a single global directory — the Store. It defaults to
`~/.owlet`, and `OWLET_HOME` overrides it:

```
export OWLET_HOME=~/work/owlet-store
```

A Thread's tree looks like this:

```
$OWLET_HOME/threads/OWL-42/
├── thread.md    # Route, status, branch, creation date (frontmatter)
├── ticket.md    # The Jira ticket's title and description, captured at Intake
├── map/         # One file per Ticket
│   ├── 001-add-the-schema-migration.md
│   ├── 002-backfill-existing-rows.md
│   └── 003-update-the-query.md
└── notes/       # Yours to use
```

Each Ticket file is frontmatter plus whatever you write below it:

```markdown
---
id: 002
title: Backfill existing rows
status: open
blocked_by: 001
---
```

The files are plain markdown and readable by hand, but the CLI is the only writer. Don't
hand-edit the Store — go through `owlet` so cycle detection and ID allocation stay honest.

## Walkthrough

### 1. Open a Thread

A Thread starts at Intake, with the Jira key, a Route, a title, and the branch the work will
live on. The description is read from stdin:

```
owlet thread new OWL-42 \
  --route drive \
  --title "Fix the frontier query" \
  --branch owl-42-fix-the-frontier-query <<'EOF'
The frontier query returns Claimed tickets when it shouldn't.
EOF
```

It prints the Thread's path. The Route is one of `drive`, `delegate`, or `split`, chosen
once here and never changed. Only `drive` produces a Map.

Creating a second Thread for the same key is refused.

### 2. Plan the Map

Add Tickets. `ticket new` prints the ID it allocated — capture it, since Blockers are
expressed by ID:

```
$ owlet ticket new OWL-42 "Add the schema migration"
001
$ owlet ticket new OWL-42 "Backfill existing rows" --blocked-by 001
002
$ owlet ticket new OWL-42 "Update the query" --blocked-by 001
003
```

`--blocked-by` takes a comma-separated list. A Ticket records only what it waits on; what it
blocks is derived. Edges that would close a cycle are rejected.

Add and remove edges later with:

```
owlet blocker add OWL-42 003 --blocked-by 002
owlet blocker rm  OWL-42 003 --blocked-by 002
```

### 3. See what's workable

`map` prints every Ticket layered by its depth in the blocking graph, flagging the Frontier:

```
$ owlet map OWL-42
DEPTH	ID	STATUS	FRONTIER	TITLE	BLOCKED_BY	BLOCKS
0	001	open	frontier	Add the schema migration		002,003
1	002	open		Backfill existing rows	001
1	003	open		Update the query	001
```

`frontier` narrows that to just the Open Tickets whose every Blocker is Done — the work you
can actually pick up now:

```
$ owlet frontier OWL-42
ID	TITLE
001	Add the schema migration
```

When the Frontier is empty, the reason goes to stderr — no Tickets, everything Done, or the
remainder Claimed or blocked — while stdout stays empty, so it stays pipeable.

### 4. Work it

```
owlet ticket claim OWL-42 001
owlet ticket done  OWL-42 001
```

Claimed Tickets are excluded from the Frontier, so a Ticket you've started doesn't keep
showing up as available. Marking a Ticket done while its own Blockers are unfinished is
allowed, but warns on stderr.

With `001` done, `002` and `003` become the Frontier:

```
$ owlet frontier OWL-42
ID	TITLE
002	Backfill existing rows
003	Update the query
```

### 5. Deliver

Delivered means owlet has nothing left to do for the Thread — for Drive, that's the pull
request being open:

```
owlet thread deliver OWL-42
```

The tree stays readable. Move it to the Archive by hand, later.

## The TUI

```
owlet tui OWL-42
```

Renders the Map as an indented tree, each Ticket nested under the depth it sits at, with the
Frontier marked `▶` in green. Called with no key, it opens the Thread whose tree was
modified most recently — including edits inside `map/` — so it lands on whatever you touched
last. Press `q` or `Esc` to quit. The TUI is read-only; every write goes through the CLI.

## Commands

| Command                                      | Does                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| `thread new <KEY> --route --title --branch`  | Create a Thread. Reads the description from stdin.          |
| `thread list`                                 | List every Thread with its Route and status.               |
| `thread show <KEY>`                           | One Thread's Route, branch, date, and Tickets.             |
| `thread deliver <KEY>`                        | Mark a Thread delivered.                                    |
| `ticket new <KEY> <title> [--blocked-by ID,ID]` | Create a Ticket. Prints the allocated ID.                |
| `ticket claim <KEY> <ID>`                     | Mark a Ticket claimed.                                      |
| `ticket done <KEY> <ID>`                      | Mark a Ticket done.                                         |
| `blocker add <KEY> <ID> --blocked-by <ID>`    | Add a Blocker edge.                                         |
| `blocker rm <KEY> <ID> --blocked-by <ID>`     | Remove a Blocker edge.                                      |
| `frontier <KEY>`                              | The Open Tickets whose every Blocker is Done.              |
| `map <KEY>`                                   | Every Ticket, layered by depth in the blocking graph.      |
| `tui [KEY]`                                   | Open the Map TUI.                                           |

`thread list`, `thread show`, `frontier`, and `map` accept `--json` for machine-readable
output. Everything else prints tab-separated columns, so `cut` and `awk` work on it.

## Plugin

This repo ships its own Claude Code plugin, `owlet`, from `.claude-plugin/` and `skills/` —
see [ADR-0001](docs/adr/0001-skills-act-cli-writes.md) for why it isn't separately versioned.
To load it from a clone, run Claude Code from the repo root with:

```
claude --plugin-dir .
```

Two skills:

- **`/intake`** — the one-instruction start of work. Give it a Jira key and it reads the
  ticket over MCP, creates the branch, transitions the ticket's status, and opens the Thread.
  After Intake, Jira is not read again. Run it from inside the work repo the ticket belongs
  to, not from inside `owlet-tracker` — the branch is created there. It drives the Drive
  Route only.
- **`/owlet-setup`** — points `/wayfinder` at owlet in a work repo, so its maps, tickets,
  blocking, and frontier become `owlet` commands instead of `gh` ones. Also run from inside
  the work repo.

The skills shell out to the compiled binary, building it on first use if `dist/owlet` isn't
there — see `skills/intake/SKILL.md` for how a skill locates it. Anything touching Jira or
git lives in a skill; `core/` and `cli/` hold no credentials.

## Layout

| Path      | Purpose                                                        |
| --------- | -------------------------------------------------------------- |
| `core/`   | The Store: Thread trees, Map graph, Frontier, cycle detection.  |
| `cli/`    | The `owlet` binary on top of `core/`. Sole writer to the Store. |
| `tui/`    | Terminal UI (Ink) on top of `core/`. Read-only.                 |
| `skills/` | The `owlet` plugin's skills — judgement and acting.             |

`cli/` and `tui/` are consumers of `core/`; dependencies never point the other way.

## Development

```
bun test          # run the test suite
bun run typecheck # tsc --noEmit
bun run build     # compile dist/owlet
```

Tests run against a temporary `OWLET_HOME`, so they never touch your real Store.

## License

MIT — see [LICENSE](LICENSE).
