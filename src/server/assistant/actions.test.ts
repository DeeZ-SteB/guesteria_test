import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { status: "ok", user: { id: "u" } } as Record<string, unknown>,
  limit: { allowed: true } as { allowed: boolean },
  rpc: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ verifiedUser: async () => mocks.auth }));
vi.mock("@/server/rate-limit", () => ({ hit: async () => mocks.limit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { decideAction } from "./actions";

const ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.auth = { status: "ok", user: { id: "u" } };
  mocks.limit = { allowed: true };
  mocks.rpc.mockReset();
});

describe("confirm / cancel a drafted action", () => {
  it("needs a live session and stays under the per-user limit", async () => {
    mocks.auth = { status: "session" };
    expect(await decideAction(ID, "confirm")).toEqual({ status: "error", reason: "session" });
    mocks.auth = { status: "ok", user: { id: "u" } };
    mocks.limit = { allowed: false };
    expect(await decideAction(ID, "confirm")).toEqual({ status: "error", reason: "rate_limited" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("runs the database function as the user and passes its verdict through", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "failed", reason: "duplicate_open" }, error: null });
    expect(await decideAction(ID, "confirm")).toEqual({ status: "failed", reason: "duplicate_open" });
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_assistant_action", { p_action_id: ID });
    mocks.rpc.mockResolvedValue({ data: { status: "cancelled" }, error: null });
    expect(await decideAction(ID, "cancel")).toEqual({ status: "cancelled" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_assistant_action", { p_action_id: ID });
  });
  it("database errors and unexpected answers are retryable errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    expect(await decideAction(ID, "confirm")).toEqual({ status: "error", reason: "retry" });
    mocks.rpc.mockResolvedValue({ data: { status: "weird" }, error: null });
    expect(await decideAction(ID, "confirm")).toEqual({ status: "error", reason: "retry" });
  });
});
