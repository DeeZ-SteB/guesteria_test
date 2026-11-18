import { describe, expect, it } from "vitest";
import { fieldErrors, signInSchema, signUpSchema } from "./schemas";

describe("signUpSchema", () => {
  const valid = { firstName: " Олена ", email: "  Olena@Example.COM ", password: "12345678" };

  it("trims the name and normalises the email", () => {
    const result = signUpSchema.parse(valid);
    expect(result.firstName).toBe("Олена");
    expect(result.email).toBe("olena@example.com");
  });

  it("accepts an 8-character password and rejects a 7-character one", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
    const short = signUpSchema.safeParse({ ...valid, password: "1234567" });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldErrors(short.error).password).toMatch(/щонайменше 8/);
  });

  it("returns Ukrainian messages for an empty name and a bad email", () => {
    const result = signUpSchema.safeParse({ ...valid, firstName: "  ", email: "olena@" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toMatchObject({
        firstName: "Вкажіть ім'я",
        email: "Вкажіть коректний email",
      });
    }
  });

  it("turns an unsafe next value into the home page", () => {
    expect(signUpSchema.parse({ ...valid, next: "//evil.com" }).next).toBe("/");
    expect(signUpSchema.parse({ ...valid, next: "/account" }).next).toBe("/account");
  });
});

describe("signInSchema", () => {
  it("requires a password but does not enforce the sign-up length rule", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("defaults next to the home page when missing", () => {
    expect(signInSchema.parse({ email: "a@b.co", password: "x" }).next).toBe("/");
  });
});
