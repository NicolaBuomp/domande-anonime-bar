import { expect, test } from "@playwright/test";

// Invio reale dal form (S1+S2): grazie, poi cooldown sullo stesso dispositivo.
test("invio dal telefono → Grazie, secondo invio → cooldown", async ({ page }) => {
  await page.goto("/");
  const question = page.getByLabel("La tua domanda");
  const submit = page.getByRole("button", { name: "Invia" });

  await expect(submit).toBeDisabled();
  await question.fill(`Domanda e2e ${Date.now()}`);
  await page.getByLabel("Nickname (facoltativo)").fill("Tester");
  await submit.click();

  await expect(page.getByRole("heading", { name: /Grazie/ })).toBeVisible();

  await page.getByRole("button", { name: "Fai un'altra domanda" }).click();
  await expect(question).toHaveValue("");
  await question.fill("Seconda domanda subito dopo");
  await submit.click();

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Hai appena inviato una domanda",
  );
  await expect(question).toHaveValue("Seconda domanda subito dopo");
  await expect(submit).toBeDisabled();
});

test("parolaccia → messaggio neutro e testo intatto", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("La tua domanda").fill("che c4zz0 di serata");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Questa domanda non può essere inviata. Prova a riformularla.",
  );
  await expect(page.getByLabel("La tua domanda")).toHaveValue("che c4zz0 di serata");
});
