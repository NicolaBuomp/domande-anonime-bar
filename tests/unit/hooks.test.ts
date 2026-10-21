import { describe, expect, it } from "vitest";
import { checkDeploy } from "../../.claude/hooks/guard-deploy.mjs";
import { checkFile } from "../../.claude/hooks/guard-files.mjs";
import { toolsFor } from "../../.claude/hooks/format.mjs";

const dir = "/repo";
const tracked = (files: string[]) => (rel: string) => files.includes(rel);

describe("guard-files", () => {
  it("blocca i file .env*", () => {
    expect(checkFile(".env.local", dir, tracked([]))).toMatch(/segreti/);
    expect(checkFile("/repo/.env", dir, tracked([]))).toMatch(/segreti/);
    expect(checkFile("/repo/.env.production.local", dir, tracked([]))).toMatch(/segreti/);
  });

  it("consente .env.example", () => {
    expect(checkFile(".env.example", dir, tracked([]))).toBeNull();
  });

  it("blocca le migration già committate e consente quelle nuove", () => {
    const m = "supabase/migrations/20261021150000_init.sql";
    expect(checkFile(m, dir, tracked([m]))).toMatch(/nuova migration/);
    expect(checkFile("supabase/migrations/20261021160000_new.sql", dir, tracked([m]))).toBeNull();
  });

  it("consente i file normali", () => {
    expect(checkFile("src/app/page.tsx", dir, tracked(["src/app/page.tsx"]))).toBeNull();
  });
});

describe("guard-deploy", () => {
  const bash = (command: string) => ({
    tool_name: "Bash",
    tool_input: { command },
  });

  it.each([
    "vercel --prod",
    "npx vercel deploy --prod --yes",
    "vercel deploy --target=production",
    "vercel deploy --target production",
    "vercel promote https://x.vercel.app",
    "vercel alias set a b",
    "vercel rollback",
  ])("blocca %s senza RELEASE_APPROVAL", (cmd) => {
    expect(checkDeploy(bash(cmd), {})).toMatch(/RELEASE_APPROVAL/);
  });

  it("consente il deploy in produzione con RELEASE_APPROVAL nell'ambiente", () => {
    expect(checkDeploy(bash("vercel --prod"), { RELEASE_APPROVAL: "1" })).toBeNull();
  });

  it("blocca RELEASE_APPROVAL impostata dentro il comando", () => {
    expect(checkDeploy(bash("RELEASE_APPROVAL=1 vercel --prod"), {})).toMatch(/dentro il comando/);
  });

  it("blocca RELEASE_APPROVAL nel comando anche se è già nell'ambiente", () => {
    expect(
      checkDeploy(bash("RELEASE_APPROVAL=1 vercel --prod"), { RELEASE_APPROVAL: "1" }),
    ).toMatch(/dentro il comando/);
  });

  it("non blocca comandi che citano RELEASE_APPROVAL e vercel senza deploy", () => {
    expect(
      checkDeploy(bash('git commit -m "hook: vercel e RELEASE_APPROVAL documentati"'), {}),
    ).toBeNull();
  });

  it("consente le preview e i comandi normali", () => {
    expect(checkDeploy(bash("vercel"), {})).toBeNull();
    expect(checkDeploy(bash("vercel deploy"), {})).toBeNull();
    expect(checkDeploy(bash("npm run build"), {})).toBeNull();
  });

  it("blocca i tool MCP di produzione", () => {
    expect(checkDeploy({ tool_name: "mcp__abc__request_promote" }, {})).toMatch(/RELEASE_APPROVAL/);
    expect(
      checkDeploy(
        {
          tool_name: "mcp__abc__create_deployment",
          tool_input: { target: "production" },
        },
        {},
      ),
    ).toMatch(/RELEASE_APPROVAL/);
    expect(
      checkDeploy(
        {
          tool_name: "mcp__abc__create_deployment",
          tool_input: { target: "preview" },
        },
        {},
      ),
    ).toBeNull();
  });
});

describe("format", () => {
  it("sceglie gli strumenti per estensione", () => {
    expect(toolsFor("src/app/page.tsx")).toEqual({
      prettier: true,
      eslint: true,
    });
    expect(toolsFor("src/app/globals.css")).toEqual({
      prettier: true,
      eslint: false,
    });
    expect(toolsFor("docs/spec.md")).toEqual({
      prettier: false,
      eslint: false,
    });
  });

  it("salta node_modules, .next e migration", () => {
    expect(toolsFor("node_modules/x/index.js").prettier).toBe(false);
    expect(toolsFor("supabase/migrations/1_init.sql").prettier).toBe(false);
  });
});
