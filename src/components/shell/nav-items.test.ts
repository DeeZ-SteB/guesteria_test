import { describe, expect, it } from "vitest";
import { activeNavKey } from "./nav-items";

describe("activeNavKey", () => {
  it("highlights search for the booking funnel", () => {
    expect(activeNavKey("/", null)).toBe("search");
    expect(activeNavKey("/hotels/lp1", null)).toBe("search");
    expect(activeNavKey("/checkout", null)).toBe("search");
  });

  it("follows the account tab and defaults to trips", () => {
    expect(activeNavKey("/account", "favorites")).toBe("favorites");
    expect(activeNavKey("/account", "profile")).toBe("profile");
    expect(activeNavKey("/account", null)).toBe("trips");
    expect(activeNavKey("/account", "unknown")).toBe("trips");
  });

  it("keeps trips active on a trip page", () => {
    expect(activeNavKey("/account/trips/abc", null)).toBe("trips");
  });

  it("highlights nothing on unknown pages", () => {
    expect(activeNavKey("/about", null)).toBeNull();
  });
});
