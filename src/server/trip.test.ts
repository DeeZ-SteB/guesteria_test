import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny PostgREST builder stand-in: every chain call returns itself; terminals resolve to queued results.
const mocks = vi.hoisted(() => {
  const results: { data: unknown; error: unknown }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "insert", "upsert", "eq", "in", "order", "limit"]) builder[m] = () => builder;
  builder.single = async () => results.shift();
  builder.maybeSingle = async () => results.shift();
  return { results, builder };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.builder }));

import { insertGuestRequest, upsertCheckin } from "./trip";

const ID = "22222222-2222-4222-8222-222222222222";
const BID = "11111111-1111-4111-8111-111111111111";
const row = { id: ID, type: "transfer", details: "x", status: "sent", source: "guest", created_at: "2026-12-01T10:00:00Z", updated_at: "2026-12-01T10:00:00Z" };
const input = { requestId: ID, bookingId: BID, type: "transfer" as const, details: "x" };

beforeEach(() => {
  mocks.results.length = 0;
});

describe("insertGuestRequest error mapping", () => {
  it("returns the new row", async () => {
    mocks.results.push({ data: row, error: null });
    expect(await insertGuestRequest("u", input)).toMatchObject({ ok: true, request: { id: ID } });
  });
  it("a replayed requestId returns the existing row (idempotent)", async () => {
    mocks.results.push({ data: null, error: { code: "23505" } }, { data: row, error: null });
    expect(await insertGuestRequest("u", input)).toMatchObject({ ok: true, request: { id: ID } });
  });
  it("a unique violation without our row is the open-per-type rule", async () => {
    mocks.results.push({ data: null, error: { code: "23505" } }, { data: null, error: null });
    expect(await insertGuestRequest("u", input)).toEqual({ ok: false, reason: "duplicate_open" });
  });
  it("maps the cap, RLS and anything else", async () => {
    mocks.results.push({ data: null, error: { code: "P0001" } });
    expect(await insertGuestRequest("u", input)).toEqual({ ok: false, reason: "limit" });
    mocks.results.push({ data: null, error: { code: "42501" } });
    expect(await insertGuestRequest("u", input)).toEqual({ ok: false, reason: "closed" });
    mocks.results.push({ data: null, error: { code: "08006" } });
    expect(await insertGuestRequest("u", input)).toEqual({ ok: false, reason: "retry" });
  });
});

describe("upsertCheckin error mapping", () => {
  const ci = { bookingId: BID, arrivalTime: "14:30", notes: "" };
  it("returns the saved check-in", async () => {
    mocks.results.push({ data: { arrival_time: "14:30:00", notes: null, completed_at: "t" }, error: null });
    expect(await upsertCheckin(ci)).toEqual({ ok: true, checkin: { arrivalTime: "14:30", notes: "", completedAt: "t" } });
  });
  it("RLS refusal is 'closed', other errors are retryable", async () => {
    mocks.results.push({ data: null, error: { code: "42501" } });
    expect(await upsertCheckin(ci)).toEqual({ ok: false, reason: "closed" });
    mocks.results.push({ data: null, error: { code: "XX000" } });
    expect(await upsertCheckin(ci)).toEqual({ ok: false, reason: "retry" });
  });
});
