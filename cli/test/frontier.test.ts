import { afterEach, describe, expect, test } from "bun:test";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

const THREAD_ARGS = ["thread", "new", "OWL-8", "--route", "drive", "--title", "The Frontier", "--branch", "owl-8-frontier"];

describe("frontier", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("a Ticket with no Blockers and status: open is in the Frontier", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);

    const result = run(["frontier", "OWL-8", "--json"], env);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toContainEqual(expect.objectContaining({ id: "001" }));
  });

  test("a Ticket whose every Blocker is Done is in the Frontier", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "new", "OWL-8", "Second", "--blocked-by", "001"], env);
    run(["ticket", "done", "OWL-8", "001"], env);

    const rows = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(rows).toContainEqual(expect.objectContaining({ id: "002" }));
  });

  test("a Ticket with at least one Blocker that is Open or Claimed is excluded", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "new", "OWL-8", "Second", "--blocked-by", "001"], env);
    run(["ticket", "claim", "OWL-8", "001"], env);

    const rows = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(rows).not.toContainEqual(expect.objectContaining({ id: "002" }));
  });

  test("a Claimed Ticket is excluded even when all its Blockers are Done", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "new", "OWL-8", "Second", "--blocked-by", "001"], env);
    run(["ticket", "done", "OWL-8", "001"], env);
    run(["ticket", "claim", "OWL-8", "002"], env);

    const rows = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(rows).not.toContainEqual(expect.objectContaining({ id: "002" }));
  });

  test("a Done Ticket is never in the Frontier", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "done", "OWL-8", "001"], env);

    const rows = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(rows).not.toContainEqual(expect.objectContaining({ id: "001" }));
  });

  test("marking a Blocker Done changes the Frontier on the very next read", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "new", "OWL-8", "Second", "--blocked-by", "001"], env);

    const before = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(before).not.toContainEqual(expect.objectContaining({ id: "002" }));

    run(["ticket", "done", "OWL-8", "001"], env);

    const after = JSON.parse(run(["frontier", "OWL-8", "--json"], env).stdout);
    expect(after).toContainEqual(expect.objectContaining({ id: "002" }));
  });

  test("an empty Frontier on a Map with unfinished work is distinguishable from a fully Done Map", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "First"], env);
    run(["ticket", "claim", "OWL-8", "001"], env);

    const unfinished = run(["frontier", "OWL-8", "--json"], env);
    expect(JSON.parse(unfinished.stdout)).toEqual([]);
    expect(unfinished.stderr).not.toBe("");

    run(["ticket", "done", "OWL-8", "001"], env);

    const done = run(["frontier", "OWL-8", "--json"], env);
    expect(JSON.parse(done.stdout)).toEqual([]);
    expect(done.stderr).not.toBe("");
    expect(done.stderr).not.toBe(unfinished.stderr);
  });

  test("the Frontier on a Map with no Tickets is empty and exits 0", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const result = run(["frontier", "OWL-8", "--json"], env);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("--json returns parseable rows; human-readable is the default", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-8", "Write the seam"], env);

    const jsonResult = run(["frontier", "OWL-8", "--json"], env);
    expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();

    const humanResult = run(["frontier", "OWL-8"], env);
    expect(humanResult.stdout).toContain("Write the seam");
  });

  test("an unknown Thread key exits non-zero", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    const result = run(["frontier", "NOPE-1"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});
