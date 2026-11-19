import { test, expect } from "./support/fixtures";

test("assistant drawer: opens from the keyboard, traps focus, closes on Esc and returns focus", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Запитати Guesteria AI" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Guesteria AI" });
  await expect(dialog).toBeVisible();
  // A native modal dialog keeps focus inside the dialog or lets it leave to the browser UI (body),
  // never onto the page behind it.
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body ? "browser" : el.closest("dialog[open]") ? "dialog" : `page: ${el.outerHTML.slice(0, 80)}`;
    });
    expect(["dialog", "browser"]).toContain(where);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("focus is visible on interactive elements", async ({ page }) => {
  await page.goto("/");
  // The header's account menu streams in; tab only once the page has settled.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /меню акаунта/i })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const { ring, html } = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { ring: "none", html: "body" };
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== "none" && s.outlineWidth !== "0px" ? "outline" : s.boxShadow !== "none" ? "shadow" : "none";
      return { ring, html: el.outerHTML.slice(0, 120) };
    });
    expect(ring, `focus ring on tab stop ${i + 1}: ${html}`).not.toBe("none");
  }
});

test("reduced motion turns transitions off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const duration = await page.getByRole("button", { name: "Знайти" }).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(duration).toBeLessThanOrEqual(0.01);
});
