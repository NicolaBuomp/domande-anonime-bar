import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";
import { localServiceClient } from "./local-db";

// Spec A8: la risincronizzazione carica al massimo 500 righe. Con più domande
// devono restare quelle più recenti, non le più vecchie.
test.beforeEach(({}, testInfo) => {
  test.skip(!!process.env.E2E_BASE_URL, "solo contro il DB locale");
  test.skip(testInfo.project.name !== "mobile-chromium", "un solo progetto basta");
});

test("oltre 500 domande la lista mostra le più recenti", async ({ page }) => {
  const db = localServiceClient();
  await db.from("questions").delete().not("id", "is", null);
  const base = Date.now() - 40 * 60 * 60_000;
  const old = Array.from({ length: 520 }, (_, i) => ({
    text: `Domanda vecchia ${i}`,
    status: "read",
    created_at: new Date(base + i * 60_000).toISOString(),
    read_at: new Date(base + i * 60_000).toISOString(),
  }));
  const { error } = await db.from("questions").insert(old);
  if (error) throw error;
  const latest = "Ultima arrivata: si vede anche dopo 520 domande?";
  const { error: e2 } = await db.from("questions").insert({ text: latest });
  if (e2) throw e2;

  await loginAsAdmin(page);
  await expect(page.getByText(latest)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuove (1)" })).toBeVisible();

  await db.from("questions").delete().not("id", "is", null);
});
