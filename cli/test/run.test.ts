import { afterEach, describe, expect, test } from "bun:test";
import { run } from "../src/run";
import { createTempHome } from "./helpers/temp-home";

describe("run", () => {
  let home: ReturnType<typeof createTempHome> | undefined;

  afterEach(() => {
    home?.cleanup();
    home = undefined;
  });

  test("bare invocation prints help to stdout and exits 0", () => {
    home = createTempHome();

    const result = run([], { OWLET_HOME: home.path });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toBe("");
  });

  test("an unrecognised command prints guidance to stderr and exits non-zero", () => {
    home = createTempHome();

    const result = run(["frobnicate"], { OWLET_HOME: home.path });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("frobnicate");
    expect(result.stdout).toBe("");
  });
});
