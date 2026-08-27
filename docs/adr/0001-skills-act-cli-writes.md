# 0001 — Skills act; the CLI only writes

**Status:** accepted
**Date:** 2026-08-27

## Context

owlet-tracker sits between Jira and the developer: `Jira <-> [owlet-tracker] <-> Me`.
Running a Thread requires two very different kinds of work.

**Judgement and outside effects.** Reading the Jira ticket, choosing a Route, refining a
description well enough to hand to hu-agent, creating the git branch, transitioning the
Jira status, opening the pull request. These need a model in the loop, credentials, and
network access.

**Structural writes.** Creating a Thread's folder tree, adding a Ticket, recording a
Blocker, marking a Ticket done. These need to be exact, atomic, and identical every
time.

The obvious design is one program that does both: a CLI that holds a Jira token and a
GitHub token and drives the whole flow. The decisive fact against it is that **MCP only
exists inside an agent session.** A plain CLI process cannot use the Atlassian MCP
server; it would have to reimplement Jira and GitHub access against raw HTTP APIs and
store long-lived credentials on disk to do so. The agent session already has all of that
access, correctly scoped, with no secret for owlet to keep.

## Decision

Split along that seam and enforce it as a convention:

- **Skills do the judgement and the acting.** Every read from Jira, every write to Jira,
  every git operation lives in a skill in the `owlet` plugin. Skills are where a model
  and MCP are available.
- **`core/` is a library.** The Store: reading and writing Thread trees, deriving the
  Map graph, computing the Frontier, detecting cycles.
- **`cli/` is the only writer to the Store**, and it is the *only* way a skill performs a
  structural write. Skills never edit markdown in the Store by hand.
- **`tui/` is read-only.**
- **`core/` and `cli/` hold no credentials and make no network calls.** `owlet thread new
  <JIRA-KEY>` creates a folder tree; it does not fetch the ticket. The skill fetches the
  ticket and passes what it learned in as arguments.

Because skills call the CLI for every structural write, skill and Store schema must
version together — so owlet-tracker ships its own plugin from this repo rather than
depending on a separately versioned one.

## Consequences

**Good.** No secrets in owlet, ever — the blast radius of a bug is one folder of
markdown. Structural writes are testable without mocking a network. Invariants that must
never break (Ticket ID allocation, cycle rejection) have exactly one place to live,
because there is exactly one writer. The CLI stays safe to call from a skill: no prompts,
no surprises, no tokens.

**Bad.** Nothing works unattended — there is no `owlet sync` and no cron job, because
outside effects require an agent session. A skill instructing an agent is weaker
enforcement than a type system: an agent can hand-edit a file in the Store and corrupt
the graph, and nothing stops it but the convention. That is the accepted cost of not
holding credentials.

**Tempting and wrong.** Adding `owlet thread new --from-jira`, or any flag that makes the
CLI reach the network. It reintroduces credentials, drags an API client into `core/`, and
duplicates what the agent session already does correctly. If a structural write needs
data from Jira, the skill fetches it and passes it as an argument.
