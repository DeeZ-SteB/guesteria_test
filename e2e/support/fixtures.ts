import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import { E2E_STATE, type RunState } from "./supabase-admin";

/**
 * Every test fails on a Content-Security-Policy violation: our report-only phase, without a collector.
 * Also exposes the run state (seeded trip) and an overflow helper.
 */
export const test = base.extend<{ csp: string[]; run: RunState }>({
  csp: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          (window as unknown as { __csp: string[] }).__csp ??= [];
          (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`);
        });
      });
      page.on("console", (m) => {
        if (m.type() === "error" && /Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
      });
      await use(violations);
      const fromPage = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
      expect([...violations, ...fromPage], "CSP violations").toEqual([]);
    },
    { auto: true },
  ],
  run: async ({}, use) => {
    await use(JSON.parse(readFileSync(E2E_STATE, "utf8")) as RunState);
  },
});

export { expect };

/** Elements that stick out to the right (empty when the page has no horizontal overflow). */
export async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    if (document.documentElement.scrollWidth <= document.documentElement.clientWidth) return [];
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 10)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} «${(el.textContent ?? "").trim().slice(0, 40)}»`);
  });
}
