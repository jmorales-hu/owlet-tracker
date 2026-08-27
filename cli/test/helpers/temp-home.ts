import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempHome(): { path: string; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), "owlet-test-"));

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}
