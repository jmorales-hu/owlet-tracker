import type { Env, Thread, Ticket } from "@owlet/core";
import {
  addBlocker,
  BlockerNotFoundError,
  claimTicket,
  createThread,
  createTicket,
  CycleError,
  deliverThread,
  doneTicket,
  frontier,
  isRoute,
  listBlockers,
  listThreads,
  listTickets,
  removeBlocker,
  ROUTES,
  showThread,
  ThreadExistsError,
  ThreadNotFoundError,
  TicketNotFoundError,
} from "@owlet/core";

export type Result = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const HELP = `owlet — personal work tracker

Usage:
  owlet <command> [options]

Commands:
  thread new <KEY> --route <route> --title <title> --branch <branch>
                          Create a Thread. Reads the description from stdin.
  thread list             List every Thread with its Route and status.
  thread show <KEY>       Show one Thread's Route, branch and creation date.
  thread deliver <KEY>    Mark a Thread delivered.
  ticket new <KEY> <title> [--blocked-by ID,ID]
                          Create a Ticket in a Thread's Map. Prints the allocated ID.
  ticket claim <KEY> <ID> Mark a Ticket claimed.
  ticket done <KEY> <ID>  Mark a Ticket done.
  blocker add <KEY> <ID> --blocked-by <ID>
                          Add a Blocker edge to a Ticket.
  blocker rm  <KEY> <ID> --blocked-by <ID>
                          Remove a Blocker edge from a Ticket.
  frontier <KEY>          List the Open Tickets whose every Blocker is Done.

Options:
  --json    Output machine-readable JSON on commands that support it
`;

type Flags = Record<string, string | true>;

type Invocation = {
  env: Env;
  positionals: string[];
  flags: Flags;
  stdin: string;
};

function parseArgs(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

function ok(stdout: string, stderr = ""): Result {
  return { stdout, stderr, exitCode: 0 };
}

function fail(message: string): Result {
  return { stdout: "", stderr: `${message}\n`, exitCode: 1 };
}

function threadJson(thread: Thread) {
  return {
    key: thread.key,
    route: thread.route,
    status: thread.status,
    branch: thread.branch,
    createdAt: thread.createdAt,
  };
}

function ticketJson(ticket: Ticket) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
  };
}

function formatThreadList(threads: Thread[]): string {
  if (threads.length === 0) return "No Threads.\n";
  const rows = threads.map((thread) => `${thread.key}\t${thread.route}\t${thread.status}`);
  return ["KEY\tROUTE\tSTATUS", ...rows].join("\n") + "\n";
}

function formatThreadDetail(thread: Thread, tickets: Ticket[]): string {
  const lines = [
    `Key:      ${thread.key}`,
    `Route:    ${thread.route}`,
    `Status:   ${thread.status}`,
    `Branch:   ${thread.branch}`,
    `Created:  ${thread.createdAt}`,
    "",
  ];

  if (tickets.length > 0) {
    lines.push("Tickets:");
    for (const ticket of tickets) lines.push(`  ${ticket.id}\t${ticket.status}\t${ticket.title}`);
    lines.push("");
  }

  return lines.join("\n");
}

function runThreadNew({ env, positionals, flags, stdin }: Invocation): Result {
  const key = positionals[0];
  if (!key) {
    return fail(
      'thread new requires a Jira key, e.g. `owlet thread new OWL-5 --route drive --title "..." --branch owl-5-thing`',
    );
  }

  const route = flags.route;
  if (typeof route !== "string" || !isRoute(route)) {
    return fail(`--route is required and must be one of: ${ROUTES.join(", ")}`);
  }

  const title = flags.title;
  if (typeof title !== "string") return fail("--title is required");

  const branch = flags.branch;
  if (typeof branch !== "string") return fail("--branch is required");

  try {
    const { path } = createThread(env, { key, route, title, branch, description: stdin });
    return ok(`${path}\n`);
  } catch (error) {
    if (error instanceof ThreadExistsError) return fail(error.message);
    throw error;
  }
}

function runThreadList({ env, flags }: Invocation): Result {
  const threads = listThreads(env);
  if (flags.json) return ok(`${JSON.stringify(threads.map(threadJson))}\n`);
  return ok(formatThreadList(threads));
}

function runThreadShow({ env, positionals, flags }: Invocation): Result {
  const key = positionals[0];
  if (!key) return fail("thread show requires a Jira key");

  try {
    const thread = showThread(env, key);
    const tickets = listTickets(env, key);
    if (flags.json) {
      return ok(`${JSON.stringify({ ...threadJson(thread), tickets: tickets.map(ticketJson) })}\n`);
    }
    return ok(formatThreadDetail(thread, tickets));
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return fail(error.message);
    throw error;
  }
}

function runThreadDeliver({ env, positionals }: Invocation): Result {
  const key = positionals[0];
  if (!key) return fail("thread deliver requires a Jira key");

  try {
    const thread = deliverThread(env, key);
    return ok(`${thread.key} delivered\n`);
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return fail(error.message);
    throw error;
  }
}

function runThread(invocation: Invocation): Result {
  const [sub, ...rest] = invocation.positionals;
  const forSub = { ...invocation, positionals: rest };

  switch (sub) {
    case "new":
      return runThreadNew(forSub);
    case "list":
      return runThreadList(forSub);
    case "show":
      return runThreadShow(forSub);
    case "deliver":
      return runThreadDeliver(forSub);
    default:
      return fail(`Unknown thread command: ${sub ?? ""}\n\n${HELP}`);
  }
}

function isKnownTicketError(
  error: unknown,
): error is ThreadNotFoundError | TicketNotFoundError | CycleError | BlockerNotFoundError {
  return (
    error instanceof ThreadNotFoundError ||
    error instanceof TicketNotFoundError ||
    error instanceof CycleError ||
    error instanceof BlockerNotFoundError
  );
}

function parseBlockedBy(flag: string | true | undefined): string[] {
  if (typeof flag !== "string") return [];
  return flag
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function runTicketNew({ env, positionals, flags }: Invocation): Result {
  const key = positionals[0];
  const title = positionals[1];
  if (!key || !title) {
    return fail('ticket new requires a Thread key and a title, e.g. `owlet ticket new OWL-5 "Do the thing"`');
  }

  const blockedBy = parseBlockedBy(flags["blocked-by"]);

  try {
    const ticket = createTicket(env, key, title, blockedBy);
    return ok(`${ticket.id}\n`);
  } catch (error) {
    if (isKnownTicketError(error)) return fail(error.message);
    throw error;
  }
}

function runTicketClaim({ env, positionals }: Invocation): Result {
  const key = positionals[0];
  const id = positionals[1];
  if (!key || !id) return fail("ticket claim requires a Thread key and a Ticket ID");

  try {
    const ticket = claimTicket(env, key, id);
    return ok(`${ticket.id} claimed\n`);
  } catch (error) {
    if (isKnownTicketError(error)) return fail(error.message);
    throw error;
  }
}

function runTicketDone({ env, positionals }: Invocation): Result {
  const key = positionals[0];
  const id = positionals[1];
  if (!key || !id) return fail("ticket done requires a Thread key and a Ticket ID");

  try {
    const blockers = listBlockers(env, key, id);
    const ticket = doneTicket(env, key, id);

    const unfinished = blockers.filter((blocker) => blocker.status !== "done");
    const stderr =
      unfinished.length > 0
        ? `Warning: ${ticket.id} is done with unfinished Blocker(s): ${unfinished.map((blocker) => blocker.id).join(", ")}\n`
        : "";

    return ok(`${ticket.id} done\n`, stderr);
  } catch (error) {
    if (isKnownTicketError(error)) return fail(error.message);
    throw error;
  }
}

function runTicket(invocation: Invocation): Result {
  const [sub, ...rest] = invocation.positionals;
  const forSub = { ...invocation, positionals: rest };

  switch (sub) {
    case "new":
      return runTicketNew(forSub);
    case "claim":
      return runTicketClaim(forSub);
    case "done":
      return runTicketDone(forSub);
    default:
      return fail(`Unknown ticket command: ${sub ?? ""}\n\n${HELP}`);
  }
}

function runBlockerAdd({ env, positionals, flags }: Invocation): Result {
  const key = positionals[0];
  const id = positionals[1];
  const blockedBy = flags["blocked-by"];
  if (!key || !id || typeof blockedBy !== "string") {
    return fail("blocker add requires a Thread key, a Ticket ID, and --blocked-by <ID>");
  }

  try {
    const ticket = addBlocker(env, key, id, blockedBy);
    return ok(`${ticket.id} blocked by ${blockedBy}\n`);
  } catch (error) {
    if (isKnownTicketError(error)) return fail(error.message);
    throw error;
  }
}

function runBlockerRemove({ env, positionals, flags }: Invocation): Result {
  const key = positionals[0];
  const id = positionals[1];
  const blockedBy = flags["blocked-by"];
  if (!key || !id || typeof blockedBy !== "string") {
    return fail("blocker rm requires a Thread key, a Ticket ID, and --blocked-by <ID>");
  }

  try {
    const ticket = removeBlocker(env, key, id, blockedBy);
    return ok(`${ticket.id} no longer blocked by ${blockedBy}\n`);
  } catch (error) {
    if (isKnownTicketError(error)) return fail(error.message);
    throw error;
  }
}

function runBlocker(invocation: Invocation): Result {
  const [sub, ...rest] = invocation.positionals;
  const forSub = { ...invocation, positionals: rest };

  switch (sub) {
    case "add":
      return runBlockerAdd(forSub);
    case "rm":
      return runBlockerRemove(forSub);
    default:
      return fail(`Unknown blocker command: ${sub ?? ""}\n\n${HELP}`);
  }
}

function formatFrontier(tickets: Ticket[]): string {
  if (tickets.length === 0) return "";
  const rows = tickets.map((ticket) => `${ticket.id}\t${ticket.title}`);
  return ["ID\tTITLE", ...rows].join("\n") + "\n";
}

function emptyFrontierReason(allTickets: Ticket[]): string {
  if (allTickets.length === 0) return "Frontier is empty: this Map has no Tickets\n";
  if (allTickets.every((ticket) => ticket.status === "done")) return "Frontier is empty: every Ticket is Done\n";
  return "Frontier is empty: remaining Tickets are Claimed or blocked\n";
}

function runFrontier({ env, positionals, flags }: Invocation): Result {
  const key = positionals[0];
  if (!key) return fail("frontier requires a Thread key");

  try {
    const rows = frontier(env, key);
    const stderr = rows.length === 0 ? emptyFrontierReason(listTickets(env, key)) : "";

    if (flags.json) return ok(`${JSON.stringify(rows.map(ticketJson))}\n`, stderr);
    return ok(formatFrontier(rows), stderr);
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return fail(error.message);
    throw error;
  }
}

export function run(argv: string[], env: Env, stdin = ""): Result {
  const { positionals, flags } = parseArgs(argv);
  const [command, ...rest] = positionals;

  if (command === undefined) {
    return { stdout: HELP, stderr: "", exitCode: 0 };
  }

  if (command === "thread") {
    return runThread({ env, positionals: rest, flags, stdin });
  }

  if (command === "ticket") {
    return runTicket({ env, positionals: rest, flags, stdin });
  }

  if (command === "blocker") {
    return runBlocker({ env, positionals: rest, flags, stdin });
  }

  if (command === "frontier") {
    return runFrontier({ env, positionals: rest, flags, stdin });
  }

  return {
    stdout: "",
    stderr: `Unknown command: ${command}\n\n${HELP}`,
    exitCode: 1,
  };
}
