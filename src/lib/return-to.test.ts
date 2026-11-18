import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps a same-site path with its query string", () => {
    expect(safeReturnTo("/hotels/lp123?checkin=2026-12-12&adults=2")).toBe(
      "/hotels/lp123?checkin=2026-12-12&adults=2",
    );
  });

  it("drops the auth modal params so the modal does not reopen after login", () => {
    expect(safeReturnTo("/account?tab=trips&auth=signin&next=%2Faccount")).toBe("/account?tab=trips");
  });

  it.each([
    ["protocol-relative URL", "//evil.com"],
    ["backslash trick", "/\\evil.com"],
    ["absolute URL", "https://evil.com/account"],
    ["javascript scheme", "javascript:alert(1)"],
    ["encoded protocol-relative URL", "/%2F%2Fevil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["control character", "/account\n"],
    ["relative path without slash", "account"],
    ["broken percent-encoding", "/%E0%A4%A"],
    // Found by the security-auditor agent: URL normalisation turns these into "//evil.com".
    ["dot-segment escape", "/..//evil.com"],
    ["single-dot escape", "/.//evil.com"],
    ["encoded dot-segment escape", "/%2e%2e//evil.com"],
    ["nested dot-segment escape", "/a/..//evil.com"],
    ["dot + backslash escape", "/./\\evil.com"],
  ])("rejects a %s", (_name, value) => {
    expect(safeReturnTo(value)).toBe("/");
  });

  it("keeps checkout links with a long offer token and rejects anything over 2048 chars", () => {
    const checkout = `/checkout?offerId=${"A".repeat(1236)}&hotel=lpbbb0c&checkin=2026-12-09&checkout=2026-12-12&adults=2`;
    expect(safeReturnTo(checkout)).toBe(checkout);
    expect(safeReturnTo(`/${"a".repeat(2048)}`)).toBe("/");
  });

  it("returns the given fallback for missing or non-string input", () => {
    expect(safeReturnTo(undefined, "/account")).toBe("/account");
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo(["/account"])).toBe("/");
  });
});
