import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A repository file or folder, found by walking up from `start`. A fixed
 * `../..` from a module breaks once tsc emits it one level deeper under dist/,
 * and repository resources (skills, scripts) are not copied there.
 */
export function findRepoPath(relative: string, start: string): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export const moduleDir = (url: string) => dirname(fileURLToPath(url));
