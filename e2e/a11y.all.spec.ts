import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures";
import { kyivToday, plusDays } from "./support/dates";
import type { Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

const pages = (tripId: string) => {
  const ci = plusDays(kyivToday(), 30);
  return [
    ["home", "/"],
    ["search results", `/?city=lviv&checkin=${ci}&checkout=${plusDays(ci, 2)}&adults=2`],
    ["hotel", `/hotels/lpbbb0c?checkin=${ci}&checkout=${plusDays(ci, 2)}&adults=2&city=lviv`],
    ["trips", "/account?tab=trips"],
    ["favorites", "/account?tab=favorites"],
    ["profile", "/account?tab=profile"],
    ["trip", `/account/trips/${tripId}`],
    ["404", "/no-such-page"],
  ] as const;
};

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("pages have no serious accessibility violations", async ({ page, run }) => {
      const problems: string[] = [];
      for (const [name, path] of pages(run.tripId)) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        problems.push(...(await scan(page)).map((p) => `${name}: ${p}`));
      }
      expect(problems).toEqual([]);
    });

    test("dialogs: assistant and cancellation sheet", async ({ page, run }) => {
      await page.goto(`/account/trips/${run.tripId}`);
      await page.getByRole("button", { name: "Скасувати бронювання" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await scan(page, "dialog[open]")).toEqual([]);
      await page.keyboard.press("Escape");
      await page.goto("/");
      await page.getByRole("button", { name: "Запитати Guesteria AI" }).click();
      await expect(page.getByRole("dialog", { name: "Guesteria AI" })).toBeVisible();
      expect(await scan(page, "dialog[open]")).toEqual([]);
    });
  });
}

test("document language and labelled form fields", async ({ page }) => {
  await page.goto("/account?tab=profile");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  // The phone field is named by its label, not its placeholder.
  await expect(page.getByLabel("Телефон")).toHaveAttribute("type", "tel");
});
