import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

const THREAD_ARGS = ["thread", "new", "OWL-6", "--route", "drive", "--title", "Tickets in a Map", "--branch", "owl-6-tickets"];

describe("ticket new", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("creates map/NNN-slug.md with status: open and an empty blocked_by", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const result = run(["ticket", "new", "OWL-6", "Write the seam"], env);
    expect(result.exitCode).toBe(0);

    const mapDir = join(home.path, "threads", "OWL-6", "map");
    const files = readdirSync(mapDir);
    expect(files).toContain("001-write-the-seam.md");

    const raw = readFileSync(join(mapDir, "001-write-the-seam.md"), "utf-8");
    expect(raw).toContain("status: open");
    expect(raw).toContain("blocked_by: ");
  });

  test("prints the allocated ID", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const result = run(["ticket", "new", "OWL-6", "First ticket"], env);
    expect(result.stdout.trim()).toBe("001");
  });

  test("IDs allocate as max + 1, zero-padded to three digits, starting at 001", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    const first = run(["ticket", "new", "OWL-6", "First"], env);
    const second = run(["ticket", "new", "OWL-6", "Second"], env);

    expect(first.stdout.trim()).toBe("001");
    expect(second.stdout.trim()).toBe("002");
  });

  test("never reuses an ID, even when a lower-numbered file was deleted by hand", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");

    run(["ticket", "new", "OWL-6", "First"], env);
    run(["ticket", "new", "OWL-6", "Second"], env);

    const mapDir = join(home.path, "threads", "OWL-6", "map");
    const files = readdirSync(mapDir);
    const firstFile = files.find((name) => name.startsWith("001-"));
    expect(firstFile).toBeDefined();

    // Delete the lower-numbered file by hand.
    unlinkSync(join(mapDir, firstFile!));

    const third = run(["ticket", "new", "OWL-6", "Third"], env);
    expect(third.stdout.trim()).toBe("003");
  });

  test("for an unknown Thread key exits non-zero", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    const result = run(["ticket", "new", "NOPE-1", "Some title"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});

describe("ticket claim / done", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("claim sets status: claimed", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Do the thing"], env);

    const result = run(["ticket", "claim", "OWL-6", "001"], env);
    expect(result.exitCode).toBe(0);

    const shown = JSON.parse(run(["thread", "show", "OWL-6", "--json"], env).stdout);
    expect(shown.tickets).toContainEqual(expect.objectContaining({ id: "001", status: "claimed" }));
  });

  test("done sets status: done", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Do the thing"], env);
    run(["ticket", "claim", "OWL-6", "001"], env);

    const result = run(["ticket", "done", "OWL-6", "001"], env);
    expect(result.exitCode).toBe(0);

    const shown = JSON.parse(run(["thread", "show", "OWL-6", "--json"], env).stdout);
    expect(shown.tickets).toContainEqual(expect.objectContaining({ id: "001", status: "done" }));
  });

  test("claim on an unknown ID exits non-zero and changes nothing", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Do the thing"], env);

    const mapDir = join(home.path, "threads", "OWL-6", "map");
    const before = readFileSync(join(mapDir, readdirSync(mapDir)[0]!), "utf-8");

    const result = run(["ticket", "claim", "OWL-6", "999"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("999");

    const after = readFileSync(join(mapDir, readdirSync(mapDir)[0]!), "utf-8");
    expect(after).toBe(before);
  });

  test("done on an unknown ID exits non-zero and changes nothing", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Do the thing"], env);

    const mapDir = join(home.path, "threads", "OWL-6", "map");
    const before = readFileSync(join(mapDir, readdirSync(mapDir)[0]!), "utf-8");

    const result = run(["ticket", "done", "OWL-6", "999"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("999");

    const after = readFileSync(join(mapDir, readdirSync(mapDir)[0]!), "utf-8");
    expect(after).toBe(before);
  });

  test("claim on an unknown Thread key exits non-zero", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };

    const result = run(["ticket", "claim", "NOPE-1", "001"], env);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("NOPE-1");
  });
});

describe("thread show carries Tickets", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("--json includes id, title and status for each Ticket", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Write the seam"], env);
    run(["ticket", "new", "OWL-6", "Wire the CLI"], env);

    const shown = JSON.parse(run(["thread", "show", "OWL-6", "--json"], env).stdout);

    expect(shown.tickets).toHaveLength(2);
    expect(shown.tickets).toContainEqual({ id: "001", title: "Write the seam", status: "open" });
    expect(shown.tickets).toContainEqual({ id: "002", title: "Wire the CLI", status: "open" });
  });

  test("human-readable output lists Tickets", () => {
    home = createTempHome();
    const env = { OWLET_HOME: home.path };
    run(THREAD_ARGS, env, "desc");
    run(["ticket", "new", "OWL-6", "Write the seam"], env);

    const result = run(["thread", "show", "OWL-6"], env);

    expect(result.stdout).toContain("Write the seam");
    expect(result.stdout).toContain("open");
  });
});
