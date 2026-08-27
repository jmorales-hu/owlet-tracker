import type { Env } from "@owlet/core";

export type Result = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const HELP = `owlet — personal work tracker

Usage:
  owlet <command> [options]

Options:
  --json    Output machine-readable JSON on commands that support it

No commands are available yet.
`;

export function run(argv: string[], _env: Env): Result {
  const command = argv.find((arg) => !arg.startsWith("--"));

  if (command === undefined) {
    return { stdout: HELP, stderr: "", exitCode: 0 };
  }

  return {
    stdout: "",
    stderr: `Unknown command: ${command}\n\n${HELP}`,
    exitCode: 1,
  };
}
