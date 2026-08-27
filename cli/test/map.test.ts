import { afterEach, describe, expect, test } from "bun:test";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

const THREAD_ARGS = ["thread", "new", "OWL-9", "--route", "drive", "--title", "The Map", "--branch", "owl-9-map"];

describe("map", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("returns ordered rows carrying id, title, status, depth, frontier, blockedBy and blocks", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "First"], env);

    const rows = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    expect(rows).toEqual([
      {
        id: "001",
        title: "First",
        status: "open",
        depth: 0,
        frontier: true,
        blockedBy: [],
        blocks: [],
      },
    ]);
  });

  test("depth is 0 for a Ticket with no Blockers", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "First"], env);

    const rows = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    expect(rows[0].depth).toBe(0);
  });

  test("depth is correct across a diamond: the joining Ticket sits below both of its Blockers", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "Root"], env);
    run(["ticket", "new", "OWL-9", "Left", "--blocked-by", "001"], env);
    run(["ticket", "new", "OWL-9", "Right", "--blocked-by", "001"], env);
    run(["ticket", "new", "OWL-9", "Join", "--blocked-by", "002,003"], env);

    const rows: Array<{ id: string; depth: number }> = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    const depthById = Object.fromEntries(rows.map((row) => [row.id, row.depth]));

    expect(depthById["001"]).toBe(0);
    expect(depthById["002"]).toBe(1);
    expect(depthById["003"]).toBe(1);
    expect(depthById["004"]).toBe(2);
  });

  test("a Map with several independent roots renders all of them, each at depth 0, in a stable order", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "Root A"], env);
    run(["ticket", "new", "OWL-9", "Root B"], env);
    run(["ticket", "new", "OWL-9", "Root C"], env);

    const rows: Array<{ id: string; depth: number }> = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(["001", "002", "003"]);
  });

  test("row order is deterministic and places a Ticket after every Ticket it waits on", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "Root"], env);
    run(["ticket", "new", "OWL-9", "Left", "--blocked-by", "001"], env);
    run(["ticket", "new", "OWL-9", "Right", "--blocked-by", "001"], env);
    run(["ticket", "new", "OWL-9", "Join", "--blocked-by", "002,003"], env);

    const first = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    const second = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    expect(first).toEqual(second);

    const indexOf = (id: string) => first.findIndex((row: { id: string }) => row.id === id);
    for (const row of first) {
      for (const blockerId of row.blockedBy) {
        expect(indexOf(blockerId)).toBeLessThan(indexOf(row.id));
      }
    }
  });

  test("the frontier flag matches `owlet frontier` exactly for the same Map", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "First"], env);
    run(["ticket", "new", "OWL-9", "Second", "--blocked-by", "001"], env);
    run(["ticket", "claim", "OWL-9", "001"], env);

    const mapRows: Array<{ id: string; frontier: boolean }> = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    const frontierIds = new Set(
      JSON.parse(run(["frontier", "OWL-9", "--json"], env).stdout).map((ticket: { id: string }) => ticket.id),
    );

    for (const row of mapRows) {
      expect(row.frontier).toBe(frontierIds.has(row.id));
    }
  });

  test("derived blocks is the exact inverse of the blocked_by edge set", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "Root"], env);
    run(["ticket", "new", "OWL-9", "Left", "--blocked-by", "001"], env);
    run(["ticket", "new", "OWL-9", "Right", "--blocked-by", "001"], env);

    const rows: Array<{ id: string; blocks: string[] }> = JSON.parse(run(["map", "OWL-9", "--json"], env).stdout);
    const blocksById = Object.fromEntries(rows.map((row) => [row.id, row.blocks]));

    expect(blocksById["001"]).toEqual(["002", "003"]);
    expect(blocksById["002"]).toEqual([]);
    expect(blocksById["003"]).toEqual([]);
  });

  test("a Map with no Tickets exits 0 with no rows", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const result = run(["map", "OWL-9", "--json"], env);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("human-readable output is the default and contains no colour or escape codes", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-9", "Write the seam"], env);

    const jsonResult = run(["map", "OWL-9", "--json"], env);
    expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();

    const humanResult = run(["map", "OWL-9"], env);
    expect(humanResult.stdout).toContain("Write the seam");
    // eslint-disable-next-line no-control-regex
    expect(humanResult.stdout).not.toMatch(/\x1b\[/);
  });

  test("an unknown Thread key exits non-zero", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    const result = run(["map", "NOPE-1"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});
