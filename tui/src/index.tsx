import type { Env, MapRow } from "@owlet/core";
import { mapRows, mostRecentThread, showThread, ThreadNotFoundError } from "@owlet/core";
import { Box, render, Text, useApp, useInput } from "ink";
import React from "react";

function Row({ row }: { row: MapRow }): React.JSX.Element {
  return (
    <Box marginLeft={row.depth * 2}>
      <Text color={row.frontier ? "green" : undefined} bold={row.frontier}>
        {row.frontier ? "▶ " : "  "}
        {row.id} [{row.status}] {row.title}
      </Text>
    </Box>
  );
}

function App({ threadKey, rows }: { threadKey: string; rows: MapRow[] }): React.JSX.Element {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{threadKey}</Text>
      {rows.length === 0 ? (
        <Text dimColor>This Map has no Tickets.</Text>
      ) : (
        rows.map((row) => <Row key={row.id} row={row} />)
      )}
      <Box marginTop={1}>
        <Text dimColor>Press q or Esc to quit.</Text>
      </Box>
    </Box>
  );
}

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

export async function main(env: Env, key?: string): Promise<void> {
  let resolvedKey: string;

  if (key) {
    try {
      showThread(env, key);
    } catch (error) {
      if (error instanceof ThreadNotFoundError) return fail(error.message);
      throw error;
    }
    resolvedKey = key;
  } else {
    const thread = mostRecentThread(env);
    if (!thread) return fail("No Threads found. Create one with `owlet thread new` first.");
    resolvedKey = thread.key;
  }

  const rows = mapRows(env, resolvedKey);
  const { waitUntilExit } = render(<App threadKey={resolvedKey} rows={rows} />);
  await waitUntilExit();
}
