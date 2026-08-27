import type { Env, Thread } from "@owlet/core";
import {
  createThread,
  deliverThread,
  isRoute,
  listThreads,
  ROUTES,
  showThread,
  ThreadExistsError,
  ThreadNotFoundError,
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

function ok(stdout: string): Result {
  return { stdout, stderr: "", exitCode: 0 };
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

function formatThreadList(threads: Thread[]): string {
  if (threads.length === 0) return "No Threads.\n";
  const rows = threads.map((thread) => `${thread.key}\t${thread.route}\t${thread.status}`);
  return ["KEY\tROUTE\tSTATUS", ...rows].join("\n") + "\n";
}

function formatThreadDetail(thread: Thread): string {
  return [
    `Key:      ${thread.key}`,
    `Route:    ${thread.route}`,
    `Status:   ${thread.status}`,
    `Branch:   ${thread.branch}`,
    `Created:  ${thread.createdAt}`,
    "",
  ].join("\n");
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
    if (flags.json) return ok(`${JSON.stringify(threadJson(thread))}\n`);
    return ok(formatThreadDetail(thread));
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

export function run(argv: string[], env: Env, stdin = ""): Result {
  const { positionals, flags } = parseArgs(argv);
  const [command, ...rest] = positionals;

  if (command === undefined) {
    return { stdout: HELP, stderr: "", exitCode: 0 };
  }

  if (command === "thread") {
    return runThread({ env, positionals: rest, flags, stdin });
  }

  return {
    stdout: "",
    stderr: `Unknown command: ${command}\n\n${HELP}`,
    exitCode: 1,
  };
}
