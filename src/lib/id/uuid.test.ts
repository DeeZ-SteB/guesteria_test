import { describe, expect, it } from "vitest";
import { z } from "zod";
import { newUuid } from "./uuid";

describe("newUuid", () => {
  it("falls back to getRandomValues outside secure contexts", () => {
    const insecure = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const ids = new Set(Array.from({ length: 50 }, () => newUuid(insecure)));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(z.uuid().safeParse(id).success).toBe(true);
  });
  it("uses randomUUID when available", () => {
    expect(newUuid({ getRandomValues: crypto.getRandomValues.bind(crypto), randomUUID: () => "x" })).toBe("x");
  });
});
