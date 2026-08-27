---
name: intake
description: Start work on a Jira ticket end to end — read it over MCP, create the branch, transition its status, and open a Thread. Use when given a Jira key to start work on.
---

Runs Intake for one Jira ticket: the one-instruction start-of-work ritual described in
`CONTEXT.md`. After this skill finishes, Jira is not read again for this ticket — everything
about it lives in the Thread this skill creates.

Run this from inside the work repo the ticket belongs to (not from inside `owlet-tracker`) —
the branch is created there.

## Route

This skill only drives the **Drive Route** — Delegate and Split don't exist in owlet yet. Say
so plainly if asked to do otherwise rather than presenting three choices; Route is chosen once,
at Intake, and never changed.

## Steps

1. **Read the ticket over MCP.** Fetch the Jira issue's key, title/summary, and description
   using whatever Atlassian MCP tools this session has (e.g. `getJiraIssue`). Never call a Jira
   REST endpoint directly and never read or store a Jira token — per ADR-0001, credentials only
   ever live in the agent session, never in this repo.

2. **Create the branch.** Name it `<key-lowercased>-<kebab-case-slug-of-the-title>`, key first,
   so Jira's own automation links the branch without anything wired by hand (e.g. `OWL-42:
   Fix the frontier query` → `owl-42-fix-the-frontier-query`). Create it with
   `git checkout -b <branch>`.

3. **Transition the Jira ticket.** Move it to the status that means work has started (usually
   "In Progress"). If the right transition isn't obvious, list the ticket's available
   transitions first rather than guessing.

4. **Call the CLI last.** Resolve the path to the `owlet` binary (see
   [Locating the binary](#locating-the-binary)), then create the Thread with:

   ```
   <owlet binary> thread new <KEY> --route drive --title "<title>" --branch <branch> <<'EOF'
   <description, verbatim from the Jira ticket>
   EOF
   ```

   This is the only structural write in this skill — never create or edit anything under
   `$OWLET_HOME` by hand, and there is no `--from-jira` flag to reach for instead (ADR-0001
   names that exact flag as the wrong turn).

   If the command refuses because a Thread already exists for this key, stop and surface that
   refusal as-is. Don't retry, don't hand-edit the Store to work around it — a duplicate Intake
   being refused is the CLI doing its job.

## Locating the binary

`$CLAUDE_PLUGIN_ROOT` is set automatically while this skill runs, and points at the
`owlet-tracker` clone this plugin shipped from.

- If `owlet` resolves on `PATH`, use it directly.
- Otherwise use `"$CLAUDE_PLUGIN_ROOT/dist/owlet"`. `dist/` is gitignored, so on a fresh clone it
  won't exist yet — build it once with `cd "$CLAUDE_PLUGIN_ROOT" && bun run build`, then reuse
  the same path on every later run.
