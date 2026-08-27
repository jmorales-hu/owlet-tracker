import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTempHome } from "./helpers/temp-home";

describe("compiled binary", () => {
  let buildDir: string;
  let binaryPath: string;

  beforeAll(() => {
    buildDir = mkdtempSync(join(tmpdir(), "owlet-build-"));
    binaryPath = join(buildDir, "owlet");

    const build = spawnSync(
      "bun",
      ["build", "./src/bin.ts", "--compile", "--outfile", binaryPath],
      { cwd: join(import.meta.dir, ".."), encoding: "utf-8" },
    );

    if (build.status !== 0) {
      throw new Error(`bun build --compile failed: ${build.stderr}`);
    }
  });

  afterAll(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("bare invocation prints help and exits 0", () => {
    const home = createTempHome();

    const result = spawnSync(binaryPath, [], {
      env: { ...process.env, OWLET_HOME: home.path },
      encoding: "utf-8",
    });

    home.cleanup();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
});
