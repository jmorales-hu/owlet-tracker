import { homedir } from "node:os";
import { join } from "node:path";

export type Env = {
  OWLET_HOME: string;
};

export function resolveHome(env: Env): string {
  return env.OWLET_HOME || join(homedir(), ".owlet");
}
