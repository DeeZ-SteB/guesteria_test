import { describe, expect, it } from "vitest";
import { checkinInputSchema, checkinRowSchema, guestRequestInputSchema, guestRequestRowSchema } from "./schemas";

const ID = "11111111-1111-4111-8111-111111111111";

describe("trip schemas", () => {
  it("accepts only 30-minute arrival slots", () => {
    expect(checkinInputSchema.safeParse({ bookingId: ID, arrivalTime: "14:30" }).success).toBe(true);
    expect(checkinInputSchema.safeParse({ bookingId: ID, arrivalTime: "10:15" }).success).toBe(false);
    expect(checkinInputSchema.safeParse({ bookingId: "x", arrivalTime: "14:30" }).success).toBe(false);
  });

  it("cleans and caps free text", () => {
    const ok = checkinInputSchema.parse({ bookingId: ID, arrivalTime: "14:30", notes: "  Пізно‮ приїду​  " });
    expect(ok.notes).toBe("Пізно приїду");
    expect(checkinInputSchema.safeParse({ bookingId: ID, arrivalTime: "14:30", notes: "x".repeat(500) }).success).toBe(true);
    expect(checkinInputSchema.safeParse({ bookingId: ID, arrivalTime: "14:30", notes: "x".repeat(501) }).success).toBe(false);
  });

  it("requires details for transfer and other", () => {
    const base = { requestId: ID, bookingId: ID };
    expect(guestRequestInputSchema.safeParse({ ...base, type: "transfer", details: " ​ " }).success).toBe(false);
    expect(guestRequestInputSchema.safeParse({ ...base, type: "other" }).success).toBe(false);
    expect(guestRequestInputSchema.safeParse({ ...base, type: "transfer", details: "З вокзалу о 9:00" }).success).toBe(true);
    expect(guestRequestInputSchema.safeParse({ ...base, type: "late_check_out" }).success).toBe(true);
    expect(guestRequestInputSchema.safeParse({ ...base, type: "spa" }).success).toBe(false);
  });

  it("drops malformed rows and Realtime payloads", () => {
    const row = { id: ID, type: "transfer", details: null, status: "sent", source: "guest", created_at: "2026-12-01T10:00:00Z", updated_at: "2026-12-01T10:00:00Z" };
    expect(guestRequestRowSchema.parse(row)).toMatchObject({ id: ID, createdAt: "2026-12-01T10:00:00Z" });
    expect(guestRequestRowSchema.safeParse({ ...row, status: "hacked" }).success).toBe(false);
    expect(guestRequestRowSchema.safeParse({ ...row, id: undefined }).success).toBe(false);
    expect(checkinRowSchema.parse({ arrival_time: "14:30:00", notes: null, completed_at: "x" })).toEqual({ arrivalTime: "14:30", notes: "", completedAt: "x" });
  });
});
