import { readFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { E2E_STATE, type RunState } from "./support/supabase-admin";

/** Signs the throwaway user in through the real UI once and saves the session. */
setup("sign in", async ({ page }) => {
  const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as RunState;
  await page.goto("/?auth=signin&next=%2Faccount");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(state.email);
  await dialog.getByLabel("Пароль", { exact: true }).fill(state.password);
  await dialog.getByRole("button", { name: "Увійти", exact: true }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
