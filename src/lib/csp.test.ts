import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("Content-Security-Policy", () => {
  it("production: no eval, no blanket ws:, Supabase over https + wss, upgrade", () => {
    const csp = buildCsp({ dev: false, supabaseUrl: "https://abc.supabase.co/" });
    const d = directives(csp);
    expect(d["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d["connect-src"]).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("dev: eval for React tooling and ws for HMR; local http Supabase is not upgraded", () => {
    const csp = buildCsp({ dev: true, supabaseUrl: "http://127.0.0.1:8721" });
    const d = directives(csp);
    expect(d["script-src"]).toContain("'unsafe-eval'");
    expect(d["connect-src"]).toEqual(["'self'", "http://127.0.0.1:8721", "ws://127.0.0.1:8721", "ws:"]);
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("keeps only the origin and ignores unsafe or missing URLs", () => {
    expect(directives(buildCsp({ dev: false, supabaseUrl: "https://abc.supabase.co/rest/v1?x=1" }))["connect-src"]).toEqual([
      "'self'",
      "https://abc.supabase.co",
      "wss://abc.supabase.co",
    ]);
    for (const bad of [undefined, "", "javascript:alert(1)", "ftp://x", "not a url"]) {
      expect(directives(buildCsp({ dev: false, supabaseUrl: bad }))["connect-src"]).toEqual(["'self'"]);
    }
  });

  it("always locks down plugins, framing, base and form targets; no wildcards", () => {
    const csp = buildCsp({ dev: false, supabaseUrl: "https://abc.supabase.co" });
    expect(csp).not.toContain("blob:");
    for (const must of ["script-src-attr 'none'", "object-src 'none'", "frame-ancestors 'none'", "frame-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
      expect(csp).toContain(must);
    }
    expect(csp).not.toMatch(/[\r\n]/);
    expect(csp).not.toMatch(/(^| )(\*|https:|http:)(;| |$)/);
  });
});
