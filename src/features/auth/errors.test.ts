import { describe, expect, it } from "vitest";
import { GENERIC_AUTH_ERROR, authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it.each([
    ["invalid_credentials", "Невірний email або пароль"],
    ["user_already_exists", "Такий email уже зареєстровано"],
    ["email_exists", "Такий email уже зареєстровано"],
    ["over_request_rate_limit", "Забагато спроб. Зачекайте хвилину й спробуйте ще"],
  ])("maps %s to Ukrainian copy", (code, message) => {
    expect(authErrorMessage({ code, message: "raw server text" })).toBe(message);
  });

  it("never shows raw server messages for unknown errors", () => {
    expect(authErrorMessage({ code: "something_new", message: "DB timeout at 10.0.0.3" })).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(authErrorMessage(new Error("boom"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});
