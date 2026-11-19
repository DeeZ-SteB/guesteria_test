import { test, expect } from "./support/fixtures";
import { kyivToday, plusDays } from "./support/dates";

/** SPEC §12, 375 px: search → hotel → booking → trip → check-in (+ request, + cancel). */
test("a guest books, checks in, asks the hotel and cancels — on a phone", async ({ page }) => {
  const checkIn = plusDays(kyivToday(), 30);
  const checkOut = plusDays(checkIn, 3);

  // Search
  await page.goto(`/?city=lviv&checkin=${checkIn}&checkout=${checkOut}&adults=2`);
  const firstHotel = page.locator('a[href^="/hotels/"]').first();
  await expect(firstHotel).toBeVisible();
  await firstHotel.click();

  // Hotel → choose a room
  await expect(page).toHaveURL(/\/hotels\//);
  const choose = page.getByRole("button", { name: "Обрати", exact: true }).first();
  await expect(choose).toBeVisible();
  await choose.click();

  // Checkout (guest details are prefilled from the profile)
  await expect(page).toHaveURL(/\/checkout\?offerId=/);
  await expect(page.getByLabel("Ім'я")).toHaveValue("Тест");
  await page.getByRole("button", { name: /Підтвердити бронювання/ }).last().click();

  // Confirmation → trip
  await expect(page.getByRole("heading", { name: "Бронювання підтверджено" })).toBeVisible();
  await page.getByRole("link", { name: "Відкрити поїздку" }).click();
  await expect(page).toHaveURL(/\/account\/trips\//);

  // Online check-in survives a reload
  await page.getByLabel("Час прибуття").selectOption("16:30");
  await page.getByLabel("Побажання (необовʼязково)").fill("Тихий номер, будь ласка");
  await page.getByRole("button", { name: "Пройти чекін" }).click();
  await expect(page.getByText("Чекін пройдено").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Прибуття о 16:30")).toBeVisible();

  // A request to the hotel appears in the list
  await page.getByRole("button", { name: "Інше", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Деталі").fill("Чи є дитяче ліжечко?");
  await page.getByRole("button", { name: "Надіслати запит" }).click();
  await expect(page.locator("#requests").getByText("Чи є дитяче ліжечко?")).toBeVisible();

  // Free cancellation → «Скасовані»
  await page.getByRole("button", { name: "Скасувати бронювання" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Скасувати бронювання" }).click();
  await expect(page.getByText("Скасовано").first()).toBeVisible();
  await page.goto("/account?tab=trips");
  await page.getByRole("tab", { name: /Скасовані/ }).click();
  await expect(page.getByText("Скасовано").first()).toBeVisible();
});
