#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { run } from "./run";

const env = { OWLET_HOME: process.env.OWLET_HOME ?? "" };
const argv = process.argv.slice(2);
const needsStdin = argv[0] === "thread" && argv[1] === "new";
const stdin = needsStdin ? readFileSync(0, "utf-8") : "";
const result = run(argv, env, stdin);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode);
