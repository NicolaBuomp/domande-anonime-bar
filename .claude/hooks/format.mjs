// @ts-check
// PostToolUse (Edit|Write|MultiEdit): prettier + eslint --fix sul solo file toccato.
// Non annulla la modifica: se restano errori eslint li riporta a Claude (exit 2).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PRETTIER_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".yml",
  ".yaml",
]);
const ESLINT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = ["node_modules/", ".next/", "supabase/migrations/"];

/**
 * @param {string} rel percorso relativo al progetto, con /
 * @returns {{ prettier: boolean, eslint: boolean }}
 */
export function toolsFor(rel) {
  if (rel.startsWith("..") || SKIP_DIRS.some((d) => rel.startsWith(d))) {
    return { prettier: false, eslint: false };
  }
  const ext = path.extname(rel);
  return { prettier: PRETTIER_EXT.has(ext), eslint: ESLINT_EXT.has(ext) };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const abs = path.resolve(projectDir, filePath);
  if (!existsSync(abs)) return;
  const rel = path.relative(projectDir, abs).split(path.sep).join("/");
  const { prettier, eslint } = toolsFor(rel);
  const bin = (/** @type {string} */ name) => path.join(projectDir, "node_modules", ".bin", name);

  if (prettier && existsSync(bin("prettier"))) {
    spawnSync(bin("prettier"), ["--write", "--log-level", "warn", abs], {
      cwd: projectDir,
      stdio: "ignore",
    });
  }
  if (eslint && existsSync(bin("eslint"))) {
    const res = spawnSync(bin("eslint"), ["--fix", abs], { cwd: projectDir, encoding: "utf8" });
    if (res.status === 1) {
      process.stderr.write(`eslint: problemi rimasti in ${rel}\n${res.stdout}`);
      process.exit(2);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    process.stderr.write(`format: ${err}\n`);
    process.exit(1);
  });
}
