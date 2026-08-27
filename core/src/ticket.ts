import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./env";
import { resolveHome } from "./env";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { ThreadNotFoundError } from "./thread";

export type TicketStatus = "open" | "claimed" | "done";

export const TICKET_STATUSES: TicketStatus[] = ["open", "claimed", "done"];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as string[]).includes(value);
}

export type Ticket = {
  id: string;
  title: string;
  status: TicketStatus;
};

export class TicketNotFoundError extends Error {
  constructor(
    public readonly key: string,
    public readonly id: string,
  ) {
    super(`No Ticket ${id} found for ${key}`);
  }
}

export class CorruptTicketError extends Error {
  constructor(key: string, id: string, reason: string) {
    super(`${key}/${id}: ticket file is corrupt (${reason})`);
  }
}

const TICKET_FILE_PATTERN = /^(\d{3})-.*\.md$/;

function mapDir(env: Env, key: string): string {
  return join(resolveHome(env), "threads", key, "map");
}

function requireMapDir(env: Env, key: string): string {
  const dir = mapDir(env, key);
  if (!existsSync(dir)) {
    throw new ThreadNotFoundError(key);
  }
  return dir;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ticketFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => TICKET_FILE_PATTERN.test(name));
}

function nextId(dir: string): string {
  const max = ticketFiles(dir).reduce((acc, name) => {
    const match = name.match(TICKET_FILE_PATTERN);
    const id = match ? Number.parseInt(match[1]!, 10) : 0;
    return Math.max(acc, id);
  }, 0);
  return String(max + 1).padStart(3, "0");
}

function findTicketFile(dir: string, id: string): string | undefined {
  return ticketFiles(dir).find((name) => name.startsWith(`${id}-`));
}

function readTicket(key: string, dir: string, filename: string): Ticket {
  const fields = parseFrontmatter(readFileSync(join(dir, filename), "utf-8"));

  const id = fields.id ?? filename.slice(0, 3);

  const status = fields.status;
  if (status === undefined || !isTicketStatus(status)) {
    throw new CorruptTicketError(key, id, `status must be one of ${TICKET_STATUSES.join(", ")}, got ${status}`);
  }

  return { id, title: fields.title ?? "", status };
}

function writeTicket(dir: string, filename: string, ticket: Ticket): void {
  writeFileSync(
    join(dir, filename),
    serializeFrontmatter({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      blocked_by: "",
    }),
  );
}

export function createTicket(env: Env, key: string, title: string): Ticket {
  const dir = requireMapDir(env, key);

  const id = nextId(dir);
  const ticket: Ticket = { id, title, status: "open" };

  writeTicket(dir, `${id}-${slugify(title)}.md`, ticket);

  return ticket;
}

export function listTickets(env: Env, key: string): Ticket[] {
  const dir = mapDir(env, key);
  if (!existsSync(dir)) return [];

  return ticketFiles(dir)
    .map((filename) => readTicket(key, dir, filename))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function transitionTicket(env: Env, key: string, id: string, status: TicketStatus): Ticket {
  const dir = requireMapDir(env, key);
  const filename = findTicketFile(dir, id);
  if (!filename) {
    throw new TicketNotFoundError(key, id);
  }

  const ticket: Ticket = { ...readTicket(key, dir, filename), status };
  writeTicket(dir, filename, ticket);

  return ticket;
}

export function claimTicket(env: Env, key: string, id: string): Ticket {
  return transitionTicket(env, key, id, "claimed");
}

export function doneTicket(env: Env, key: string, id: string): Ticket {
  return transitionTicket(env, key, id, "done");
}
