import { expect, test } from "@playwright/test";

test("la home risponde in italiano", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Fai una domanda");
});
