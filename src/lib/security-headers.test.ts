import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// Found by the security-auditor agent (stage 4): no security headers were configured.
describe("security headers", () => {
  it("applies anti-framing, nosniff and referrer policy to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*");
    const map = Object.fromEntries((all?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
    expect(map["x-frame-options"]).toBe("DENY");
    expect(map["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(map["x-content-type-options"]).toBe("nosniff");
    expect(map["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("never caches or indexes checkout", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const checkout = rules.find((r) => r.source === "/checkout");
    const map = Object.fromEntries((checkout?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
    expect(map["cache-control"]).toBe("private, no-store");
    expect(map["x-robots-tag"]).toBe("noindex");
  });
});
