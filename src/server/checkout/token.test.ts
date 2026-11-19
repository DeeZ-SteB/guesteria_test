import { beforeAll, describe, expect, it } from "vitest";
import { clientReferenceFor, signCheckoutToken, TOKEN_TTL_MS, verifyCheckoutToken } from "./token";

beforeAll(() => {
  process.env.CHECKOUT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
});

const payload = {
  uid: "00000000-0000-4000-8000-00000000000a",
  pid: "4bFPhxkgn",
  hid: "lpbbb0c",
  ci: "2026-12-09",
  co: "2026-12-12",
  ad: 2,
  occ: 1,
  amt: 26648.98,
  cur: "UAH",
  room: "Double/Twin",
  board: "RO",
  city: "lviv",
  img: null,
  name: "Grand Hotel",
  rf: true,
  until: "2026-12-06T10:00:00.000Z",
};
const NOW = 1_800_000_000_000;

describe("checkout token", () => {
  it("round-trips a signed payload", () => {
    const result = verifyCheckoutToken(signCheckoutToken(payload, NOW), NOW + 1000);
    expect(result).toMatchObject({ ok: true, expired: false, payload: { ...payload, v: 1 } });
  });

  it("rejects any change to the signed body (e.g. a cheaper price)", () => {
    const token = signCheckoutToken(payload, NOW)!;
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, ...payload, amt: 1, exp: NOW + TOKEN_TTL_MS })).toString("base64url");
    expect(verifyCheckoutToken(`${forged}.${mac}`, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects garbage and tokens signed with another key", () => {
    expect(verifyCheckoutToken("nope", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyCheckoutToken(undefined, NOW)).toEqual({ ok: false, reason: "invalid" });
    const token = signCheckoutToken(payload, NOW);
    process.env.CHECKOUT_SECRET = "another-secret-0123456789abcdef0123456789ab";
    expect(verifyCheckoutToken(token, NOW).ok).toBe(false);
    process.env.CHECKOUT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
  });

  it("expires after 30 minutes, but can still resolve an existing attempt when allowed", () => {
    const token = signCheckoutToken(payload, NOW);
    expect(verifyCheckoutToken(token, NOW + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(verifyCheckoutToken(token, NOW + TOKEN_TTL_MS + 1, { allowExpired: true })).toMatchObject({ ok: true, expired: true });
  });

  // Review fix: values the verifier rejects used to be signed anyway → every submit failed.
  it("refuses to sign a payload it would not accept back", () => {
    expect(signCheckoutToken({ ...payload, pid: "bad id/with slash" }, NOW)).toBeNull();
    expect(signCheckoutToken({ ...payload, name: "" }, NOW)).toBeNull();
    expect(signCheckoutToken({ ...payload, ad: 9 }, NOW)).toBeNull();
  });
});

describe("clientReferenceFor", () => {
  it("is deterministic per user + prebook and differs otherwise", () => {
    const a = clientReferenceFor(payload.uid, "P1");
    expect(a).toMatch(/^gs-[0-9a-f]{24}$/);
    expect(clientReferenceFor(payload.uid, "P1")).toBe(a);
    expect(clientReferenceFor(payload.uid, "P2")).not.toBe(a);
    expect(clientReferenceFor("00000000-0000-4000-8000-00000000000b", "P1")).not.toBe(a);
  });
});
