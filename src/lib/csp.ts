/**
 * Content-Security-Policy for every response (set in next.config.ts).
 *
 * No nonces: they force dynamic rendering of every route and do not work with the prerendered
 * shells of cacheComponents/PPR (Next docs, "Static vs Dynamic Rendering with CSP"). The app has no
 * inline scripts of its own, but Next's streamed RSC payload is inline, hence 'unsafe-inline' for
 * scripts — the policy the docs give for apps without nonces. XSS defence therefore rests on React
 * escaping (no dangerouslySetInnerHTML anywhere) and sanitised supplier HTML; the CSP still blocks
 * plugins, framing, <base> hijacking, foreign form targets and exfiltration to other hosts.
 */
export function buildCsp({ dev, supabaseUrl }: { dev: boolean; supabaseUrl?: string }): string {
  const supabase = origin(supabaseUrl);
  const connect = ["'self'"];
  if (supabase) connect.push(supabase.origin, `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`);
  if (dev) connect.push("ws:"); // HMR on LAN / Docker hosts

  const policy: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // Inline <script> blocks are needed (RSC payload); inline event-handler attributes never are.
    ["script-src-attr", ["'none'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]], // next/image `fill` and React style props
    ["img-src", ["'self'", "data:"]], // hotel photos come through /_next/image
    ["font-src", ["'self'"]], // next/font is self-hosted
    ["connect-src", connect],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]], // maps are links, not embeds
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = policy.map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only when Supabase itself is https: upgrading would break the local http stack. (Serving the app
  // over plain http against an https Supabase — e.g. the Docker image locally against Cloud — is not
  // supported: Safari would upgrade same-origin requests. The Vercel toolbar is intentionally blocked.)
  if (supabase?.protocol === "https:") parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

function origin(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? new URL(url.origin) : null;
  } catch {
    return null;
  }
}
