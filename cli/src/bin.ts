#!/usr/bin/env bun
import { run } from "./run";

const env = { OWLET_HOME: process.env.OWLET_HOME ?? "" };
const result = run(process.argv.slice(2), env);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode);
