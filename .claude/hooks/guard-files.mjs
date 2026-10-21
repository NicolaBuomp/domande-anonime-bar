// @ts-check
// PreToolUse (Edit|Write|MultiEdit|NotebookEdit): blocca la modifica di file
// che non devono essere toccati da un agente. Exit 2 = bloccato, motivo su stderr.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string} filePath percorso assoluto o relativo a projectDir
 * @param {string} projectDir
 * @param {(rel: string) => boolean} isTracked true se il file è già committato
 * @returns {string | null} motivo del blocco, oppure null se consentito
 */
export function checkFile(filePath, projectDir, isTracked) {
  const abs = path.resolve(projectDir, filePath);
  const rel = path.relative(projectDir, abs).split(path.sep).join("/");
  const base = path.basename(abs);

  if (base.startsWith(".env") && base !== ".env.example") {
    return (
      `Bloccato: ${rel} è un file .env* e può contenere segreti. ` +
      "Non si modifica da Claude: documenta la variabile in .env.example " +
      "e chiedi a Nicola di impostare il valore."
    );
  }

  if (rel.startsWith("supabase/migrations/") && isTracked(rel)) {
    return (
      `Bloccato: ${rel} è una migration già committata (quindi considerata applicata). ` +
      "Non va riscritta: crea una nuova migration con `supabase migration new <nome>`."
    );
  }

  return null;
}

/** @param {string} projectDir */
function gitTracked(projectDir) {
  return (/** @type {string} */ rel) => {
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", rel], {
        cwd: projectDir,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  const ti = input.tool_input ?? {};
  const filePath = ti.file_path ?? ti.notebook_path;
  if (!filePath) return;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const reason = checkFile(filePath, projectDir, gitTracked(projectDir));
  if (reason) {
    process.stderr.write(reason + "\n");
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    // in caso di dubbio si blocca: meglio un falso positivo che un .env riscritto
    process.stderr.write(`guard-files: errore interno (${err}), modifica bloccata.\n`);
    process.exit(2);
  });
}
