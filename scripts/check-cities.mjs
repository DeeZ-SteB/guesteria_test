// Verifies every city in src/lib/cities.ts returns hotels from LiteAPI (exact cityName spelling).
//   node --env-file=.env scripts/check-cities.mjs
// Read-only, sandbox key. Not part of CI.
import { CITIES } from "../src/lib/cities.ts";

const key = process.env.LITEAPI_KEY;
if (!key) {
  console.error("LITEAPI_KEY is missing");
  process.exit(1);
}

const MIN_HOTELS = 20;
let failed = 0;
for (const city of CITIES) {
  const url = new URL("https://api.liteapi.travel/v3.0/data/hotels");
  url.searchParams.set("countryCode", city.countryCode);
  url.searchParams.set("cityName", city.cityName);
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: { "X-API-Key": key, accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  const total = typeof body.total === "number" ? body.total : 0;
  // Very few hotels usually means a near-miss spelling (LiteAPI has e.g. Ternopil and Ternopilʼ).
  const ok = res.ok && total >= MIN_HOTELS;
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✖"} ${city.countryCode} ${city.cityName.padEnd(18)} ${total} hotels`);
}

console.log(failed ? `\n${failed} city name(s) need fixing` : "\nAll cities resolve");
process.exit(failed ? 1 : 0);
