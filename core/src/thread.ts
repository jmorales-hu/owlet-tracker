import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./env";
import { resolveHome } from "./env";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

export type Route = "delegate" | "drive" | "split";
export type ThreadStatus = "active" | "delivered";

export const ROUTES: Route[] = ["delegate", "drive", "split"];
export const THREAD_STATUSES: ThreadStatus[] = ["active", "delivered"];

export function isRoute(value: string): value is Route {
  return (ROUTES as string[]).includes(value);
}

export function isThreadStatus(value: string): value is ThreadStatus {
  return (THREAD_STATUSES as string[]).includes(value);
}

export type Thread = {
  key: string;
  route: Route;
  status: ThreadStatus;
  branch: string;
  createdAt: string;
};

export class ThreadExistsError extends Error {
  constructor(public readonly key: string) {
    super(`A Thread already exists for ${key}`);
  }
}

export class ThreadNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`No Thread found for ${key}`);
  }
}

export type CreateThreadInput = {
  key: string;
  route: Route;
  branch: string;
  title: string;
  description: string;
};

function threadsDir(env: Env): string {
  return join(resolveHome(env), "threads");
}

function threadDir(env: Env, key: string): string {
  return join(threadsDir(env), key);
}

function threadFile(dir: string): string {
  return join(dir, "thread.md");
}

export class CorruptThreadError extends Error {
  constructor(key: string, reason: string) {
    super(`${key}: thread.md is corrupt (${reason})`);
  }
}

function readThread(dir: string, key: string): Thread {
  const fields = parseFrontmatter(readFileSync(threadFile(dir), "utf-8"));

  const route = fields.route;
  if (route === undefined || !isRoute(route)) {
    throw new CorruptThreadError(key, `route must be one of ${ROUTES.join(", ")}, got ${route}`);
  }

  const status = fields.status;
  if (status === undefined || !isThreadStatus(status)) {
    throw new CorruptThreadError(key, `status must be one of ${THREAD_STATUSES.join(", ")}, got ${status}`);
  }

  return {
    key: fields.key ?? key,
    route,
    status,
    branch: fields.branch ?? "",
    createdAt: fields.created_at ?? "",
  };
}

function writeThread(dir: string, thread: Thread): void {
  writeFileSync(
    threadFile(dir),
    serializeFrontmatter({
      key: thread.key,
      route: thread.route,
      status: thread.status,
      branch: thread.branch,
      created_at: thread.createdAt,
    }),
  );
}

export function createThread(env: Env, input: CreateThreadInput): { path: string; thread: Thread } {
  const dir = threadDir(env, input.key);

  if (existsSync(dir)) {
    throw new ThreadExistsError(input.key);
  }

  const thread: Thread = {
    key: input.key,
    route: input.route,
    status: "active",
    branch: input.branch,
    createdAt: new Date().toISOString(),
  };

  mkdirSync(join(dir, "map"), { recursive: true });
  mkdirSync(join(dir, "notes"), { recursive: true });
  writeThread(dir, thread);
  writeFileSync(join(dir, "ticket.md"), `# ${input.title}\n\n${input.description}\n`);

  return { path: dir, thread };
}

export function listThreads(env: Env): Thread[] {
  const dir = threadsDir(env);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((key) => existsSync(threadFile(join(dir, key))))
    .map((key) => readThread(join(dir, key), key))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function showThread(env: Env, key: string): Thread {
  const dir = threadDir(env, key);
  if (!existsSync(threadFile(dir))) {
    throw new ThreadNotFoundError(key);
  }
  return readThread(dir, key);
}

export function deliverThread(env: Env, key: string): Thread {
  const dir = threadDir(env, key);
  if (!existsSync(threadFile(dir))) {
    throw new ThreadNotFoundError(key);
  }

  const thread: Thread = { ...readThread(dir, key), status: "delivered" };
  writeThread(dir, thread);

  return thread;
}
