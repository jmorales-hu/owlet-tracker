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
  blockedBy: string[];
};

export type MapRow = {
  id: string;
  title: string;
  status: TicketStatus;
  depth: number;
  frontier: boolean;
  blockedBy: string[];
  blocks: string[];
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

export class CycleError extends Error {
  constructor(
    public readonly key: string,
    public readonly path: string[],
  ) {
    super(`${key}: this edge would create a cycle: ${path.join(" -> ")}`);
  }
}

export class BlockerNotFoundError extends Error {
  constructor(
    public readonly key: string,
    public readonly id: string,
    public readonly blockerId: string,
  ) {
    super(`${key}/${id} is not blocked by ${blockerId}`);
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

function parseBlockedBy(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function serializeBlockedBy(ids: string[]): string {
  return ids.join(",");
}

function readTicket(key: string, dir: string, filename: string): Ticket {
  const fields = parseFrontmatter(readFileSync(join(dir, filename), "utf-8"));

  const id = fields.id ?? filename.slice(0, 3);

  const status = fields.status;
  if (status === undefined || !isTicketStatus(status)) {
    throw new CorruptTicketError(key, id, `status must be one of ${TICKET_STATUSES.join(", ")}, got ${status}`);
  }

  return { id, title: fields.title ?? "", status, blockedBy: parseBlockedBy(fields.blocked_by) };
}

function writeTicket(dir: string, filename: string, ticket: Ticket): void {
  writeFileSync(
    join(dir, filename),
    serializeFrontmatter({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      blocked_by: serializeBlockedBy(ticket.blockedBy),
    }),
  );
}

// Maps each Ticket ID to the IDs it is blocked by.
function buildEdges(key: string, dir: string): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const filename of ticketFiles(dir)) {
    const ticket = readTicket(key, dir, filename);
    edges.set(ticket.id, ticket.blockedBy);
  }
  return edges;
}

// BFS from `start`, following blocked_by edges, returning the first path found to `target`.
function findPath(edges: Map<string, string[]>, start: string, target: string): string[] | undefined {
  const queue: string[][] = [[start]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    if (last === target) return path;
    if (visited.has(last)) continue;
    visited.add(last);
    for (const next of edges.get(last) ?? []) {
      queue.push([...path, next]);
    }
  }

  return undefined;
}

// Throws if adding the edge `id -> blockerId` (id is blocked by blockerId) would create a cycle,
// including the degenerate self-edge case.
function assertNoCycle(edges: Map<string, string[]>, key: string, id: string, blockerId: string): void {
  if (id === blockerId) {
    throw new CycleError(key, [id, blockerId]);
  }

  const pathBack = findPath(edges, blockerId, id);
  if (pathBack) {
    throw new CycleError(key, [id, ...pathBack]);
  }
}

export function createTicket(env: Env, key: string, title: string, blockedBy: string[] = []): Ticket {
  const dir = requireMapDir(env, key);

  const id = nextId(dir);
  const edges = buildEdges(key, dir);

  const uniqueBlockedBy: string[] = [];
  for (const blockerId of blockedBy) {
    if (uniqueBlockedBy.includes(blockerId)) continue;
    if (blockerId === id) {
      throw new CycleError(key, [id, blockerId]);
    }
    if (!findTicketFile(dir, blockerId)) {
      throw new TicketNotFoundError(key, blockerId);
    }
    assertNoCycle(edges, key, id, blockerId);
    edges.set(id, [...(edges.get(id) ?? []), blockerId]);
    uniqueBlockedBy.push(blockerId);
  }

  const ticket: Ticket = { id, title, status: "open", blockedBy: uniqueBlockedBy };
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

export function addBlocker(env: Env, key: string, id: string, blockerId: string): Ticket {
  const dir = requireMapDir(env, key);
  const filename = findTicketFile(dir, id);
  if (!filename) {
    throw new TicketNotFoundError(key, id);
  }
  if (!findTicketFile(dir, blockerId)) {
    throw new TicketNotFoundError(key, blockerId);
  }

  const ticket = readTicket(key, dir, filename);
  if (ticket.blockedBy.includes(blockerId)) {
    return ticket;
  }

  const edges = buildEdges(key, dir);
  assertNoCycle(edges, key, id, blockerId);

  const updated: Ticket = { ...ticket, blockedBy: [...ticket.blockedBy, blockerId] };
  writeTicket(dir, filename, updated);

  return updated;
}

export function removeBlocker(env: Env, key: string, id: string, blockerId: string): Ticket {
  const dir = requireMapDir(env, key);
  const filename = findTicketFile(dir, id);
  if (!filename) {
    throw new TicketNotFoundError(key, id);
  }

  const ticket = readTicket(key, dir, filename);
  if (!ticket.blockedBy.includes(blockerId)) {
    throw new BlockerNotFoundError(key, id, blockerId);
  }

  const updated: Ticket = { ...ticket, blockedBy: ticket.blockedBy.filter((blocked) => blocked !== blockerId) };
  writeTicket(dir, filename, updated);

  return updated;
}

function isOnFrontier(ticket: Ticket, doneIds: Set<string>): boolean {
  return ticket.status === "open" && ticket.blockedBy.every((blockerId) => doneIds.has(blockerId));
}

// The Open Tickets whose every Blocker is Done. Derived fresh from blocked_by edges on
// every call — never stored, so it reflects a Blocker's status change immediately.
export function frontier(env: Env, key: string): Ticket[] {
  const dir = requireMapDir(env, key);
  const tickets = ticketFiles(dir).map((filename) => readTicket(key, dir, filename));
  const doneIds = new Set(tickets.filter((ticket) => ticket.status === "done").map((ticket) => ticket.id));

  return tickets.filter((ticket) => isOnFrontier(ticket, doneIds)).sort((a, b) => a.id.localeCompare(b.id));
}

// Layered rows for the whole Map: depth in the blocking graph, the Frontier flag, and the
// derived `blocks` set (the inverse of `blocked_by`, computed fresh — never stored). Ordered
// by depth then id, which always places a Ticket after every Ticket it waits on.
export function mapRows(env: Env, key: string): MapRow[] {
  const dir = requireMapDir(env, key);
  const tickets = ticketFiles(dir).map((filename) => readTicket(key, dir, filename));
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const doneIds = new Set(tickets.filter((ticket) => ticket.status === "done").map((ticket) => ticket.id));

  const blocks = new Map<string, string[]>();
  for (const ticket of tickets) {
    for (const blockerId of ticket.blockedBy) {
      blocks.set(blockerId, [...(blocks.get(blockerId) ?? []), ticket.id]);
    }
  }

  const depths = new Map<string, number>();
  function depthOf(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    const blockedBy = byId.get(id)?.blockedBy ?? [];
    const depth = blockedBy.length === 0 ? 0 : 1 + Math.max(...blockedBy.map(depthOf));
    depths.set(id, depth);
    return depth;
  }

  return tickets
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      depth: depthOf(ticket.id),
      frontier: isOnFrontier(ticket, doneIds),
      blockedBy: ticket.blockedBy,
      blocks: (blocks.get(ticket.id) ?? []).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

export function listBlockers(env: Env, key: string, id: string): Ticket[] {
  const dir = requireMapDir(env, key);
  const filename = findTicketFile(dir, id);
  if (!filename) {
    throw new TicketNotFoundError(key, id);
  }

  const ticket = readTicket(key, dir, filename);
  return ticket.blockedBy.map((blockerId) => {
    const blockerFilename = findTicketFile(dir, blockerId);
    if (!blockerFilename) {
      throw new TicketNotFoundError(key, blockerId);
    }
    return readTicket(key, dir, blockerFilename);
  });
}
