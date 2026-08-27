import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

const NEW_ARGS = ["thread", "new", "OWL-5", "--route", "drive", "--title", "Threads: Intake through Delivered", "--branch", "owl-5-thread-intake"];

describe("thread new", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("creates threads/<KEY>/ with thread.md, ticket.md, map/ and notes/", () => {
    home = createTempHome();

    const result = run(NEW_ARGS, { OWLET_HOME: home.path }, "The ticket description.");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const dir = join(home.path, "threads", "OWL-5");
    expect(existsSync(join(dir, "thread.md"))).toBe(true);
    expect(existsSync(join(dir, "ticket.md"))).toBe(true);
    expect(statSync(join(dir, "map")).isDirectory()).toBe(true);
    expect(statSync(join(dir, "notes")).isDirectory()).toBe(true);
  });

  test("thread.md frontmatter carries key, route, status, branch, created_at", () => {
    home = createTempHome();

    run(NEW_ARGS, { OWLET_HOME: home.path }, "The ticket description.");

    const raw = readFileSync(join(home.path, "threads", "OWL-5", "thread.md"), "utf-8");
    expect(raw).toContain("key: OWL-5");
    expect(raw).toContain("route: drive");
    expect(raw).toContain("status: active");
    expect(raw).toContain("branch: owl-5-thread-intake");
    expect(raw).toMatch(/created_at: \d{4}-\d{2}-\d{2}T/);
  });

  test("ticket.md contains the title and the description read from stdin", () => {
    home = createTempHome();

    run(NEW_ARGS, { OWLET_HOME: home.path }, "The ticket description.");

    const raw = readFileSync(join(home.path, "threads", "OWL-5", "ticket.md"), "utf-8");
    expect(raw).toContain("Threads: Intake through Delivered");
    expect(raw).toContain("The ticket description.");
  });

  test("prints the created path on stdout", () => {
    home = createTempHome();

    const result = run(NEW_ARGS, { OWLET_HOME: home.path }, "desc");

    expect(result.stdout.trim()).toBe(join(home.path, "threads", "OWL-5"));
  });

  test("for an existing key exits non-zero, changes nothing on disk, and says why", () => {
    home = createTempHome();

    run(NEW_ARGS, { OWLET_HOME: home.path }, "first description");
    const before = readFileSync(join(home.path, "threads", "OWL-5", "thread.md"), "utf-8");

    const result = run(NEW_ARGS, { OWLET_HOME: home.path }, "second description, should be discarded");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("OWL-5");
    expect(result.stdout).toBe("");

    const after = readFileSync(join(home.path, "threads", "OWL-5", "thread.md"), "utf-8");
    expect(after).toBe(before);
  });

  test("$OWLET_HOME is respected", () => {
    home = createTempHome();

    const result = run(NEW_ARGS, { OWLET_HOME: home.path }, "desc");

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(home.path, "threads", "OWL-5", "thread.md"))).toBe(true);
  });
});

describe("thread list", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("reflects every Thread created, with Route and status", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    run(["thread", "new", "OWL-5", "--route", "drive", "--title", "T5", "--branch", "b5"], env, "d");
    run(["thread", "new", "OWL-6", "--route", "delegate", "--title", "T6", "--branch", "b6"], env, "d");

    const result = run(["thread", "list", "--json"], env);
    const threads = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(threads).toHaveLength(2);
    expect(threads).toContainEqual(expect.objectContaining({ key: "OWL-5", route: "drive", status: "active" }));
    expect(threads).toContainEqual(expect.objectContaining({ key: "OWL-6", route: "delegate", status: "active" }));
  });

  test("with no Threads returns an empty list", () => {
    home = createTempHome();

    const result = run(["thread", "list", "--json"], { OWLET_HOME: home.path });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("human-readable output is the default", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    run(["thread", "new", "OWL-5", "--route", "drive", "--title", "T5", "--branch", "b5"], env, "d");

    const result = run(["thread", "list"], env);

    expect(() => JSON.parse(result.stdout)).toThrow();
    expect(result.stdout).toContain("OWL-5");
    expect(result.stdout).toContain("drive");
  });
});

describe("thread show", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("reflects what Intake wrote", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    run(NEW_ARGS, env, "desc");

    const result = run(["thread", "show", "OWL-5", "--json"], env);
    const thread = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(thread).toMatchObject({
      key: "OWL-5",
      route: "drive",
      status: "active",
      branch: "owl-5-thread-intake",
    });
    expect(thread.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("an unknown key exits non-zero", () => {
    home = createTempHome();

    const result = run(["thread", "show", "NOPE-1"], { OWLET_HOME: home.path });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});

describe("thread deliver", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("sets status to delivered and leaves the tree in place under threads/", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    run(NEW_ARGS, env, "desc");

    const result = run(["thread", "deliver", "OWL-5"], env);
    expect(result.exitCode).toBe(0);

    const shown = JSON.parse(run(["thread", "show", "OWL-5", "--json"], env).stdout);
    expect(shown.status).toBe("delivered");
    expect(existsSync(join(home.path, "threads", "OWL-5", "thread.md"))).toBe(true);
    expect(readdirSync(join(home.path, "threads"))).toContain("OWL-5");
  });

  test("an unknown key exits non-zero", () => {
    home = createTempHome();

    const result = run(["thread", "deliver", "NOPE-1"], { OWLET_HOME: home.path });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});
