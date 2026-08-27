# owlet-tracker

A personal system for tracking work that originates as Jira tickets. It holds the
working state of that work as markdown on disk, and renders the shape of that work —
especially the blocking graph of a Map — so progress is visible at a glance.

## Threads

**Thread**:
One unit of work, originating from exactly one Jira ticket, owning a folder tree of
markdown that lives from Intake through delivery and archival.
_Avoid_: main-task, epic, story, job

**Intake**:
The first step of every Thread: pull the Jira ticket into markdown and choose a Route.
After Intake, Jira is not read again.
_Avoid_: alpha, import, sync

**Route**:
Which of the three workflows a Thread follows. Chosen once at Intake and never changed.
_Avoid_: path, mode, track, type

**Delegate**:
The Route for a ticket handed to hu-agent. No code is written locally; the Thread is
delivered once hu-agent is assigned.
_Avoid_: bravo, agent, handoff

**Drive**:
The Route for a ticket worked locally, producing a Map and its Tickets, and delivered
as one pull request.
_Avoid_: charlie, solo, build

**Split**:
The Route for a ticket too large to work, delivered by creating child Jira tickets.
Produces no pull request; each child begins its own Thread at Intake.
_Avoid_: delta, breakdown, decompose

**Delivered**:
The point at which owlet-tracker has nothing left to do for a Thread. Per Route:
Delegate — hu-agent assigned; Drive — pull request opened; Split — child Jira tickets
created.
_Avoid_: done, closed, complete

## Maps

**Map**:
The plan for a Drive Thread: its Tickets and the blocking relationships between them.
_Avoid_: plan, board, backlog

**Ticket**:
One unit of work inside a Map. Exists only in the Store — never in Jira. A Ticket is
Open, Claimed, or Done.
_Avoid_: task, issue, subtask, card

**Blocker**:
A Ticket that must be Done before another Ticket can be started. A Ticket records only
the Blockers it waits on; what it blocks is derived, never stored.
_Avoid_: dependency, parent, prerequisite

**Claimed**:
A Ticket that has been started but is not Done. Claimed Tickets are excluded from the
Frontier.
_Avoid_: in progress, wip, assigned

**Done**:
A Ticket whose work is finished. Scoped to a single Ticket — a Thread ending is
Delivered, not Done.
_Avoid_: closed, complete, resolved

**Frontier**:
The Open Tickets in a Map whose every Blocker is Done — the work that can be picked up
now. Always derived from the Map, never stored.
_Avoid_: ready queue, next up, todo

## Storage

**Store**:
The single global directory holding every Thread's folder tree. Source of truth for all
work state; there is no database.
_Avoid_: workspace, vault, db

**Archive**:
Where a Thread's tree is moved when you retire it, by hand, some time after it is
Delivered. Archived Threads are readable, and are hard-deleted one month after being
archived.
_Avoid_: trash, cold storage
