import { expect, test } from "@playwright/test";
import { loginAsAdmin, newDevicePage, sendQuestion, TABLET } from "./helpers";

test("/admin senza sessione → login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
  await expect(page.getByRole("heading", { name: "Area gestore" })).toBeVisible();
});

test("credenziali sbagliate → messaggio generico", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("nessuno@example.test");
  await page.getByLabel("Password").fill("sbagliata-123");
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Email o password non corretti.",
  );
});

test("domanda dal telefono → compare in /admin senza reload → in onda → letta → eliminata", async ({
  browser,
  page: phone,
}, testInfo) => {
  const admin = await newDevicePage(browser, testInfo, TABLET);
  await loginAsAdmin(admin);
  await expect(admin.getByTestId("conn-status")).toHaveAttribute("data-conn", "live");

  const text = `Realtime e2e ${testInfo.project.name} ${Date.now()}`;
  await sendQuestion(phone, text, "Giulia");

  // < 20 s del polling di riserva: se compare entro 10 s è arrivata via Realtime
  const card = admin.getByRole("article").filter({ hasText: text });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("Giulia");

  await card.getByRole("button", { name: "Manda in onda" }).click();
  const onAir = admin.locator("section", { has: admin.locator("#on-air-title") });
  await expect(onAir.getByRole("article")).toContainText(text);

  await onAir.getByRole("button", { name: "Letta" }).click();
  await expect(onAir).toContainText("Niente in onda.");

  await admin.getByText(/^Lette \(\d+\)$/).click();
  const readCard = admin.getByRole("article").filter({ hasText: text });
  await readCard.getByRole("button", { name: "Elimina" }).click();
  await readCard.getByRole("button", { name: "Sicuro?" }).click();
  await expect(admin.getByRole("article").filter({ hasText: text })).toHaveCount(0);

  await admin.context().close();
});
