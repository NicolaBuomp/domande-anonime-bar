import { test } from "@playwright/test";
import { loginAsAdmin, newDevicePage, PROJECTOR, TABLET } from "./helpers";
import { LONG_QUESTION, putOnAir, seedEvening } from "./local-db";

// Screenshot da controllare a mano (artifacts/screenshots, gitignored).
// Solo in locale e su un progetto: popola il DB con dati realistici.
const OUT = "artifacts/screenshots";
const PHONE = { width: 390, height: 844 };

test.beforeEach(({}, testInfo) => {
  test.skip(!!process.env.E2E_BASE_URL, "solo contro il DB locale");
  test.skip(testInfo.project.name !== "mobile-chromium", "un solo progetto basta");
});

test("form pubblico: vuoto, errore, grazie", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/form-375.png`, fullPage: true });

  await page.getByLabel("La tua domanda").fill("x".repeat(320));
  await page.screenshot({ path: `${OUT}/form-375-troppo-lunga.png`, fullPage: true });

  await page.getByLabel("La tua domanda").fill("Si può prenotare un tavolo per sabato?");
  await page.getByRole("button", { name: "Invia" }).click();
  await page.getByRole("heading", { name: /Grazie/ }).waitFor();
  await page.screenshot({ path: `${OUT}/form-375-grazie.png`, fullPage: true });
});

test("admin: telefono e tablet", async ({ browser }, testInfo) => {
  await seedEvening();
  for (const [name, viewport] of [
    ["telefono", PHONE],
    ["tablet", TABLET],
  ] as const) {
    const page = await newDevicePage(browser, testInfo, viewport);
    await loginAsAdmin(page);
    await page.getByText("Avete birre senza glutine?").waitFor();
    await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: true });
    await page.getByText(/^Lette \(\d+\)$/).click();
    await page.screenshot({ path: `${OUT}/admin-${name}-lette.png`, fullPage: true });
    await page.context().close();
  }
});

test("schermo 1920×1080: corta, 300 caratteri, in attesa", async ({ browser }, testInfo) => {
  await seedEvening();
  const page = await newDevicePage(browser, testInfo, PROJECTOR);
  await page.goto("/screen");
  await page.getByRole("blockquote").filter({ hasText: "cocktail" }).waitFor();
  await page.waitForTimeout(400); // fine dissolvenza
  await page.screenshot({ path: `${OUT}/screen-1920-corta.png` });

  await putOnAir(LONG_QUESTION);
  await page.getByRole("blockquote").filter({ hasText: "bancone" }).waitFor();
  await page.waitForTimeout(400); // fine dissolvenza
  await page.screenshot({ path: `${OUT}/screen-1920-300-caratteri.png` });

  await putOnAir(null);
  await page.getByRole("heading", { name: "Hai una domanda?" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/screen-1920-attesa.png` });
  await page.context().close();
});

test("QR: anteprima, stampa e PDF A4", async ({ browser, browserName }, testInfo) => {
  const page = await newDevicePage(browser, testInfo, { width: 1280, height: 900 });
  await page.goto("/admin/qr");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.getByRole("img", { name: /QR code/ }).waitFor();
  await page.screenshot({ path: `${OUT}/qr-anteprima.png`, fullPage: true });

  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${OUT}/qr-stampa.png`, fullPage: true });
  if (browserName === "chromium") {
    await page.pdf({ path: `${OUT}/qr-a4.pdf`, format: "A4", printBackground: true });
  }
  await page.context().close();
});
