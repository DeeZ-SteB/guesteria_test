// LIVE tier (npm run e2e:live): the real LiteAPI sandbox. Local only, never in CI.
// Creates ONE sandbox booking per run and cancels it through the app.
import { test, expect } from "../support/fixtures";
import { kyivToday, plusDays } from "../support/dates";

test("live sandbox: book a refundable room and cancel it", async ({ page }) => {
  test.setTimeout(240_000);
  // Sandbox availability varies by date: try a few stays.
  let found = false;
  for (const offset of [27, 32, 38, 45]) {
    const checkIn = plusDays(kyivToday(), offset);
    await page.goto(`/hotels/lpbbb0c?checkin=${checkIn}&checkout=${plusDays(checkIn, 2)}&adults=2&city=lviv`);
    const chip = page.getByRole("button", { name: "Безкоштовне скасування" });
    const none = page.getByRole("heading", { name: "Немає вільних номерів на ці дати" });
    await expect(chip.or(none)).toBeVisible({ timeout: 60_000 });
    if (await none.isVisible()) continue;
    await chip.click();
    if (await page.getByRole("button", { name: "Обрати", exact: true }).first().isVisible()) {
      found = true;
      break;
    }
  }
  test.skip(!found, "no refundable rate in the sandbox for the tried dates");
  await page.getByRole("button", { name: "Обрати", exact: true }).first().click();
  await page.getByRole("button", { name: /Підтвердити бронювання/ }).last().click();
  await expect(page.getByRole("heading", { name: "Бронювання підтверджено" })).toBeVisible({ timeout: 90_000 });
  const number = await page.locator("b.font-mono").textContent();
  console.log(`[e2e:live] sandbox booking ${number} — cancelling`);
  await page.getByRole("link", { name: "Відкрити поїздку" }).click();
  await page.getByRole("button", { name: "Скасувати бронювання" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Скасувати бронювання" }).click();
  await expect(page.getByText("Скасовано").first()).toBeVisible({ timeout: 60_000 });
});
