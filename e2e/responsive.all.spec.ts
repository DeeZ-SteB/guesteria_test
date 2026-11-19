import { test, expect, overflowing } from "./support/fixtures";
import { kyivToday, plusDays } from "./support/dates";

const WIDTHS = [320, 375, 768, 1280];

test("no horizontal scrolling on key pages at 320 / 375 / 768 / 1280", async ({ page, run }) => {
  const ci = plusDays(kyivToday(), 30);
  const paths = [
    "/",
    `/?city=lviv&checkin=${ci}&checkout=${plusDays(ci, 2)}&adults=2`,
    `/hotels/lpbbb0c?checkin=${ci}&checkout=${plusDays(ci, 2)}&adults=2&city=lviv`,
    "/account?tab=trips",
    "/account?tab=favorites",
    "/account?tab=profile",
    `/account/trips/${run.tripId}`,
  ];
  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const out = await overflowing(page);
      if (out.length) problems.push(`${width}px ${path}: ${out.join("; ")}`);
    }
  }
  expect(problems).toEqual([]);
});
