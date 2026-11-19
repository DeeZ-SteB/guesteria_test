import { describe, expect, it } from "vitest";
import { accountTabSchema, deleteAccountSchema, passwordSchema, profileSchema } from "./schemas";

describe("account schemas", () => {
  it("falls back to the trips tab", () => {
    expect(accountTabSchema.parse("profile")).toBe("profile");
    expect(accountTabSchema.parse("admin")).toBe("trips");
    expect(accountTabSchema.parse(undefined)).toBe("trips");
  });

  it("normalises phones and rejects junk", () => {
    const ok = profileSchema.parse({ firstName: " Олена ", phone: "+38 (067) 123-45-67", aiLanguage: "uk" });
    expect(ok).toEqual({ firstName: "Олена", lastName: "", phone: "+380671234567", aiLanguage: "uk" });
    expect(profileSchema.safeParse({ firstName: "A", phone: "", aiLanguage: "auto" }).success).toBe(true);
    expect(profileSchema.safeParse({ firstName: "A", phone: "12ab", aiLanguage: "auto" }).success).toBe(false);
    expect(profileSchema.safeParse({ firstName: "A", phone: "+1234567890123456", aiLanguage: "auto" }).success).toBe(false);
  });

  it("requires a first name, caps lengths and the language list", () => {
    expect(profileSchema.safeParse({ firstName: "  ", aiLanguage: "uk" }).success).toBe(false);
    expect(profileSchema.safeParse({ firstName: "x".repeat(51), aiLanguage: "uk" }).success).toBe(false);
    expect(profileSchema.safeParse({ firstName: "A", aiLanguage: "de" }).success).toBe(false);
  });

  it("password: new must differ from current and be confirmed", () => {
    expect(passwordSchema.safeParse({ currentPassword: "old-pass1", newPassword: "new-pass1", confirm: "new-pass1" }).success).toBe(true);
    const same = passwordSchema.safeParse({ currentPassword: "same-pass", newPassword: "same-pass", confirm: "same-pass" });
    expect(same.error?.issues[0].path).toEqual(["newPassword"]);
    const mismatch = passwordSchema.safeParse({ currentPassword: "old-pass1", newPassword: "new-pass1", confirm: "new-pass2" });
    expect(mismatch.error?.issues[0].path).toEqual(["confirm"]);
    expect(passwordSchema.safeParse({ currentPassword: "", newPassword: "new-pass1", confirm: "new-pass1" }).success).toBe(false);
  });

  it("delete needs the password and the exact word", () => {
    expect(deleteAccountSchema.safeParse({ currentPassword: "x", confirm: "ВИДАЛИТИ" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ currentPassword: "x", confirm: "видалити" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ currentPassword: "", confirm: "ВИДАЛИТИ" }).success).toBe(false);
  });
});
