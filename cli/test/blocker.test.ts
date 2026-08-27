import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

const THREAD_ARGS = ["thread", "new", "OWL-7", "--route", "drive", "--title", "Blockers", "--branch", "owl-7-blockers"];

function mapDir(home: string): string {
  return join(home, "threads", "OWL-7", "map");
}

function ticketFile(home: string, id: string): string {
  const dir = mapDir(home);
  const filename = readdirSync(dir).find((name) => name.startsWith(`${id}-`));
  if (!filename) throw new Error(`no ticket file for ${id}`);
  return readFileSync(join(dir, filename), "utf-8");
}

describe("ticket new --blocked-by", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("records both edges on the new Ticket's blocked_by", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);

    const result = run(["ticket", "new", "OWL-7", "Third", "--blocked-by", "001,002"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("003");

    expect(ticketFile(home.path, "003")).toContain("blocked_by: 001,002");
  });

  test("an edge referencing an unknown Ticket ID exits non-zero and changes nothing", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const result = run(["ticket", "new", "OWL-7", "First", "--blocked-by", "999"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("999");
    expect(readdirSync(mapDir(home.path))).toHaveLength(0);
  });

  test("a cycle attempted through ticket new --blocked-by is rejected, and no Ticket file is left behind", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);

    // The next allocated ID would be 003. Predicting it and blocking on it creates a self-edge.
    const result = run(["ticket", "new", "OWL-7", "Third", "--blocked-by", "003"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("003 -> 003");
    expect(readdirSync(mapDir(home.path))).toHaveLength(2);
  });
});

describe("blocker add", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("appends an edge to the waiting Ticket only; the blocking Ticket's file is untouched", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);

    const blockerBefore = ticketFile(home.path, "001");

    const result = run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);
    expect(result.exitCode).toBe(0);

    expect(ticketFile(home.path, "002")).toContain("blocked_by: 001");
    expect(ticketFile(home.path, "001")).toBe(blockerBefore);
  });

  test("an edge referencing an unknown Ticket ID exits non-zero and changes nothing", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);

    const before = ticketFile(home.path, "001");
    const result = run(["blocker", "add", "OWL-7", "001", "--blocked-by", "999"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("999");
    expect(ticketFile(home.path, "001")).toBe(before);
  });

  test("a direct cycle is rejected non-zero with the cycle path in the output", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["blocker", "add", "OWL-7", "001", "--blocked-by", "002"], env);

    const result = run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("002");
    expect(result.stderr).toContain("001");
  });

  test("a longer cycle across three or more Tickets is rejected the same way", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["ticket", "new", "OWL-7", "Third"], env);
    run(["blocker", "add", "OWL-7", "001", "--blocked-by", "002"], env);
    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "003"], env);

    const result = run(["blocker", "add", "OWL-7", "003", "--blocked-by", "001"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("001");
    expect(result.stderr).toContain("002");
    expect(result.stderr).toContain("003");
  });

  test("a self-edge is rejected", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);

    const result = run(["blocker", "add", "OWL-7", "001", "--blocked-by", "001"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("001");
  });

  test("adding a duplicate edge does not produce a duplicated entry in blocked_by", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);

    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);
    const result = run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);

    expect(result.exitCode).toBe(0);
    expect(ticketFile(home.path, "002")).toContain("blocked_by: 001");
    expect(ticketFile(home.path, "002")).not.toContain("blocked_by: 001,001");
  });
});

describe("blocker rm", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("removes the edge", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);

    const result = run(["blocker", "rm", "OWL-7", "002", "--blocked-by", "001"], env);

    expect(result.exitCode).toBe(0);
    expect(ticketFile(home.path, "002")).toContain("blocked_by: \n");
  });

  test("removing an edge that does not exist exits non-zero", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);

    const result = run(["blocker", "rm", "OWL-7", "002", "--blocked-by", "001"], env);

    expect(result.exitCode).not.toBe(0);
  });
});

describe("ticket done with Blockers", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("on a Ticket with an unfinished Blocker exits 0, sets status: done, and writes a warning to stderr", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);

    const result = run(["ticket", "done", "OWL-7", "002"], env);

    expect(result.exitCode).toBe(0);
    expect(ticketFile(home.path, "002")).toContain("status: done");
    expect(result.stderr).not.toBe("");
    expect(result.stderr).toContain("001");
  });

  test("on a Ticket whose Blockers are all Done writes nothing to stderr", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);
    run(["ticket", "new", "OWL-7", "Second"], env);
    run(["blocker", "add", "OWL-7", "002", "--blocked-by", "001"], env);
    run(["ticket", "done", "OWL-7", "001"], env);

    const result = run(["ticket", "done", "OWL-7", "002"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("on a Ticket with no Blockers writes nothing to stderr", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-7", "First"], env);

    const result = run(["ticket", "done", "OWL-7", "001"], env);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });
});
