import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { parseProfileMeta } from "./auth";

describe("parseProfileMeta (user-writable user_metadata)", () => {
  it("keeps valid values", () => {
    expect(parseProfileMeta({ first_name: "Олена", last_name: "К", phone: "+380671234567", ai_language: "en" })).toEqual({
      first_name: "Олена",
      last_name: "К",
      phone: "+380671234567",
      ai_language: "en",
    });
  });
  it("turns wrong types, oversized and unknown values into defaults", () => {
    expect(parseProfileMeta({ first_name: 42, last_name: "x".repeat(51), phone: { a: 1 }, ai_language: "de", is_admin: true })).toEqual({
      first_name: "",
      last_name: "",
      phone: "",
      ai_language: "auto",
    });
  });
  it("survives missing or non-object metadata", () => {
    const empty = { first_name: "", last_name: "", phone: "", ai_language: "auto" };
    expect(parseProfileMeta(undefined)).toEqual(empty);
    expect(parseProfileMeta("x")).toEqual(empty);
    expect(parseProfileMeta([1, 2])).toEqual(empty);
  });
});
