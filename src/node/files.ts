import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { FileMap } from "../engine/load.js";

/** Reads a data repo's data/ folder into a FileMap (paths relative to the repo root, "/" separators). */
export function readDataDir(root: string): FileMap {
  const out: FileMap = {};
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(root, p).split(sep).join("/")] = readFileSync(p, "utf8");
    }
  };
  walk(join(root, "data"));
  return out;
}
