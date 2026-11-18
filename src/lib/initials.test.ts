import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("uses first letters of first and last name, uppercased Cyrillic", () => {
    expect(initials({ firstName: "костянтин", lastName: "стеблюк" })).toBe("КС");
  });

  it("works with only a first name", () => {
    expect(initials({ firstName: "Олена" })).toBe("О");
  });

  it("falls back to the email when the name is empty or blank", () => {
    expect(initials({ firstName: "  ", lastName: "", email: "guest@example.com" })).toBe("G");
  });

  it("does not split emoji or other astral characters", () => {
    expect(initials({ firstName: "😀Smile" })).toBe("😀");
  });

  it("returns a placeholder when nothing is known", () => {
    expect(initials({})).toBe("?");
  });
});
