import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";

export const TABLET = { width: 820, height: 1180 };
export const PROJECTOR = { width: 1920, height: 1080 };

/** Nuovo contesto (altro dispositivo) con le stesse opzioni del progetto. */
export async function newDevicePage(
  browser: Browser,
  testInfo: TestInfo,
  viewport?: { width: number; height: number },
): Promise<Page> {
  const { baseURL, extraHTTPHeaders } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, extraHTTPHeaders, viewport });
  return context.newPage();
}

export async function loginAsAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Domande" })).toBeVisible();
}

export async function sendQuestion(page: Page, text: string, nickname?: string) {
  await page.goto("/");
  await page.getByLabel("La tua domanda").fill(text);
  if (nickname) await page.getByLabel("Nickname (facoltativo)").fill(nickname);
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByRole("heading", { name: /Grazie/ })).toBeVisible();
}
