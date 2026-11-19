import { afterEach, describe, expect, it } from "vitest";
import { anthropicBaseUrl, liteApiHosts } from "./env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("LiteAPI hosts (E2E mock seam)", () => {
  it("defaults to the real LiteAPI hosts", () => {
    delete process.env.LITEAPI_MOCK_ORIGIN;
    expect(liteApiHosts()).toEqual({ data: "https://api.liteapi.travel/v3.0", book: "https://book.liteapi.travel/v3.0" });
  });
  it("needs an explicit E2E opt-in, then accepts only a loopback http mock", () => {
    process.env.LITEAPI_MOCK_ORIGIN = "http://127.0.0.1:8782";
    delete process.env.E2E_MOCKS;
    expect(() => liteApiHosts()).toThrow(); // a stray variable alone does nothing
    process.env.E2E_MOCKS = "1";
    expect(liteApiHosts()).toEqual({ data: "http://127.0.0.1:8782/data/v3.0", book: "http://127.0.0.1:8782/book/v3.0" });
    for (const bad of ["https://evil.test", "http://10.0.0.1:8782", "http://localhost:8782", "http://localhost.evil.test", "http://user@127.0.0.1:8782", "file:///etc/passwd"]) {
      process.env.LITEAPI_MOCK_ORIGIN = bad;
      expect(() => liteApiHosts(), bad).toThrow();
    }
  });
  it("is refused on Vercel (the API key must never leave for a mock there)", () => {
    process.env.LITEAPI_MOCK_ORIGIN = "http://127.0.0.1:8782";
    process.env.E2E_MOCKS = "1";
    process.env.VERCEL = "1";
    expect(() => liteApiHosts()).toThrow();
  });
});

describe("Anthropic base URL", () => {
  it("is the official API unless an explicit local E2E sink is configured", () => {
    delete process.env.E2E_ANTHROPIC_SINK;
    expect(anthropicBaseUrl()).toBe("https://api.anthropic.com");
    process.env.E2E_ANTHROPIC_SINK = "http://127.0.0.1:8782/anthropic";
    delete process.env.E2E_MOCKS;
    expect(() => anthropicBaseUrl()).toThrow();
    process.env.E2E_MOCKS = "1";
    expect(anthropicBaseUrl()).toBe("http://127.0.0.1:8782/anthropic");
    process.env.E2E_ANTHROPIC_SINK = "https://evil.test/anthropic";
    expect(() => anthropicBaseUrl()).toThrow();
    process.env.E2E_ANTHROPIC_SINK = "http://127.0.0.1:8782/anthropic";
    process.env.VERCEL = "1";
    expect(() => anthropicBaseUrl()).toThrow();
  });
});
