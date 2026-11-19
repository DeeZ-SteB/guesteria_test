import { test, expect, overflowing } from "./support/fixtures";
import { kyivToday, plusDays } from "./support/dates";

/** SPEC §12, 1280 px: the same hotel page on a desktop. */
test("hotel page on a desktop: gallery, rooms, inline AI block, no floating button", async ({ page }) => {
  const checkIn = plusDays(kyivToday(), 30);
  await page.goto(`/hotels/lpbbb0c?checkin=${checkIn}&checkout=${plusDays(checkIn, 2)}&adults=2&city=lviv`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Обрати", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Запитати AI про цей готель|Запитати AI/ }).first()).toBeVisible();
  // The inline AI block replaces the floating button on desktop hotel pages.
  const fab = page.locator("[data-ai-fab]");
  await expect(fab).toHaveCount(1); // it exists…
  await expect(fab).toBeHidden(); // …but is hidden on desktop hotel pages
  expect(await overflowing(page)).toEqual([]);
});
