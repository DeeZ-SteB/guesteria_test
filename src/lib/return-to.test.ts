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
  ])("rejects a %s", (_name, value) => {
    expect(safeReturnTo(value)).toBe("/");
  });

  it("rejects overlong values", () => {
    expect(safeReturnTo(`/${"a".repeat(600)}`)).toBe("/");
  });

  it("returns the given fallback for missing or non-string input", () => {
    expect(safeReturnTo(undefined, "/account")).toBe("/account");
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo(["/account"])).toBe("/");
  });
});
