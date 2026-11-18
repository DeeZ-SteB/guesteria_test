import { describe, expect, it } from "vitest";
import { isProtectedPath, signInRedirectPath } from "./auth-routes";

describe("isProtectedPath", () => {
  it("protects the account page and everything under it", () => {
    expect(isProtectedPath("/account")).toBe(true);
    expect(isProtectedPath("/account/trips/123")).toBe(true);
  });

  it("does not protect public pages or look-alike paths", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/hotels/lp1")).toBe(false);
    expect(isProtectedPath("/accounts")).toBe(false);
  });
});

describe("signInRedirectPath", () => {
  it("opens the auth modal on the home page and encodes the return path", () => {
    expect(signInRedirectPath("/account?tab=trips")).toBe("/?auth=signin&next=%2Faccount%3Ftab%3Dtrips");
  });
});
