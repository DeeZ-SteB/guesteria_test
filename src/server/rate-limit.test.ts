import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), broken: false }));
vi.mock("@/server/db/admin", () => ({
  createAdminClient: () => ({
    // A plain function (not vi.fn) for the outage case: Vitest reports errors thrown by mocks.
    rpc: (...args: unknown[]) => (mocks.broken ? Promise.reject(new Error("down")) : mocks.rpc(...args)),
  }),
}));

import { hit, hitAll, ipKey } from "./rate-limit";

process.env.CHECKOUT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";

beforeEach(() => mocks.rpc.mockReset());

describe("rate limits", () => {
  it("passes the counter's answer through", async () => {
    mocks.rpc.mockResolvedValue({ data: { allowed: true, retry_after: 10 }, error: null });
    expect(await hit("assistantUser", "u1")).toEqual({ allowed: true });
    expect(mocks.rpc).toHaveBeenCalledWith("rate_limit_hit", { p_key: "assistantUser:u1", p_limit: 30, p_window_seconds: 3600 });
    mocks.rpc.mockResolvedValue({ data: { allowed: false, retry_after: 42 }, error: null });
    expect(await hit("assistantUser", "u1")).toEqual({ allowed: false, retryAfter: 42 });
  });

  it("fails closed when the counter is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    expect((await hit("bookAll", "all")).allowed).toBe(false);
    mocks.broken = true;
    expect((await hit("bookAll", "all")).allowed).toBe(false);
    mocks.broken = false;
  });

  it("hitAll refuses if any limit refuses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: true }, error: null }).mockResolvedValueOnce({ data: { allowed: false, retry_after: 5 }, error: null });
    expect(await hitAll([["bookUserHour", "u"], ["bookAll", "all"]])).toEqual({ allowed: false, retryAfter: 5 });
  });

  it("stops at the first refusal: a user over their own limit never touches the shared counter", async () => {
    mocks.rpc.mockResolvedValue({ data: { allowed: false, retry_after: 9 }, error: null });
    await hitAll([["bookUserHour", "u"], ["bookUserDay", "u"], ["bookAll", "all"]]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1].p_key).toBe("bookUserHour:u");
  });

  it("groups IPv6 by the first 64 bits, also for compressed addresses", () => {
    const k = (ip: string) => ipKey(new Headers({ "x-forwarded-for": ip }), { vercel: true });
    expect(k("2001:db8::abcd:1")).toBe(k("2001:db8:0:0:ffff::2"));
    expect(k("2001:db8::1")).not.toBe(k("2001:db9::1"));
    expect(k("::ffff:203.0.113.7")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("trusts x-forwarded-for only on Vercel and never keeps the raw IP", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(ipKey(h, { vercel: false })).toBe("local");
    const k = ipKey(h, { vercel: true });
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
    // IPv6 addresses in one /64 share a bucket.
    expect(ipKey(new Headers({ "x-forwarded-for": "2001:db8:1:2:aaaa::1" }), { vercel: true })).toBe(
      ipKey(new Headers({ "x-forwarded-for": "2001:db8:1:2:bbbb::9" }), { vercel: true }),
    );
  });
});
