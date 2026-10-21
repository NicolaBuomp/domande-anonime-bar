// @ts-check
// PreToolUse (Bash + tool MCP di Vercel): blocca i deploy in produzione se manca
// RELEASE_APPROVAL nell'ambiente del processo. Il rilascio lo autorizza Nicola.
import { pathToFileURL } from "node:url";

const PROD_CLI = [
  /\bvercel\b[^\n;&|]*\s--prod\b/,
  /\bvercel\b[^\n;&|]*\s--target[=\s]+production\b/,
  /\bvercel\s+(promote|alias|rollback)\b/,
];

const PROD_MCP =
  /__(request_promote|assign_alias|request_rollback|start_rolling_release|approve_rolling_release_stage|complete_rolling_release)$/;

/**
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown> }} input
 * @param {Record<string, string | undefined>} env
 * @returns {string | null} motivo del blocco, oppure null se consentito
 */
export function checkDeploy(input, env) {
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  let isProd = false;

  if (tool === "Bash") {
    const cmd = String(ti.command ?? "");
    isProd = PROD_CLI.some((re) => re.test(cmd));
    // un deploy in produzione che si "autorizza" da solo nel comando non vale
    if (isProd && /\bRELEASE_APPROVAL\b/.test(cmd)) {
      return (
        "Bloccato: RELEASE_APPROVAL non si imposta dentro il comando. " +
        "L'approvazione del rilascio in produzione la dà Nicola, impostandola nel proprio ambiente."
      );
    }
  } else if (PROD_MCP.test(tool)) {
    isProd = true;
  } else if (/__create_deployment$/.test(tool)) {
    isProd = String(ti.target ?? "") === "production";
  }

  if (isProd && !env.RELEASE_APPROVAL) {
    return (
      "Bloccato: deploy in produzione senza RELEASE_APPROVAL. " +
      "Il rilascio in produzione lo autorizza Nicola, dopo l'e2e verde sulla preview. " +
      "Per le preview usa `vercel` senza --prod (o la PR)."
    );
  }
  return null;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const reason = checkDeploy(JSON.parse(raw || "{}"), process.env);
  if (reason) {
    process.stderr.write(reason + "\n");
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    process.stderr.write(`guard-deploy: errore interno (${err}), comando bloccato.\n`);
    process.exit(2);
  });
}
