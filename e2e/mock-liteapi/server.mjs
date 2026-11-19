// Deterministic LiteAPI stand-in for E2E (port 8782, loopback only).
//
// It serves the REAL recorded sandbox responses from src/server/liteapi/__fixtures__, adapted to the
// request: every ISO date is shifted by the difference between the requested check-in and the
// fixture's check-in (so cancellation deadlines stay relative to the stay), the hotel id is
// substituted, and offer ids encode the stay so prebook/book can follow it. Booking state lives in
// memory (duplicate client references → 4005, like the sandbox).
//
// /anthropic/* is a sink: it answers 500 and counts hits — E2E must never reach the model.
// GET /__stats → { anthropicHits, books, keyMismatches }.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.env.MOCK_PORT ?? 8782);
const KEY = process.env.LITEAPI_KEY ?? "";
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../src/server/liteapi/__fixtures__");
const load = (name) => {
  const raw = JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
  return "body" in raw && "httpStatus" in raw ? raw.body : raw;
};

const FIXTURE = { hotel: "lpbbb0c", checkIn: "2026-12-09", checkOut: "2026-12-12" };
const DAY = 86_400_000;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Shift every YYYY-MM-DD in a JSON value by n days; substitute the hotel id. */
function adapt(value, { shift = 0, hotelId = FIXTURE.hotel } = {}) {
  const text = JSON.stringify(value)
    .replace(/(\d{4}-\d{2}-\d{2})/g, (d) => (Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ? d : addDays(d, shift)))
    .replaceAll(`"${FIXTURE.hotel}"`, JSON.stringify(hotelId));
  return JSON.parse(text);
}

// Offer ids carry the stay (base64url JSON) — valid for the app's offer-id schema.
const encodeOffer = (o) => "MOCK" + Buffer.from(JSON.stringify(o)).toString("base64url");
const decodeOffer = (id) => {
  try {
    return JSON.parse(Buffer.from(String(id).replace(/^MOCK/, ""), "base64url").toString());
  } catch {
    return null;
  }
};

const stats = { anthropicHits: 0, books: 0, keyMismatches: 0 };
const prebooks = new Map(); // prebookId → stay
const bookings = new Map(); // bookingId → booking
let seq = 0;

// The booking seeded by global setup for the trip / a11y specs.
function registerBooking(id, stay, clientReference = `gs-${String(++seq).padStart(24, "0")}`) {
  const shift = days(FIXTURE.checkIn, stay.checkIn);
  const base = adapt(load("booking").data, { shift, hotelId: stay.hotelId });
  const booking = { ...base, bookingId: id, supplierBookingId: id, clientReference, prebookId: stay.prebookId ?? "PB-SEED", status: "CONFIRMED", checkin: stay.checkIn, checkout: stay.checkOut };
  bookings.set(id, booking);
  return booking;
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === "/__stats") return json(res, 200, stats);
  if (path === "/__seed" && req.method === "POST") {
    const b = await readBody(req);
    return json(res, 200, registerBooking(b.bookingId, b));
  }
  if (path.startsWith("/anthropic")) {
    stats.anthropicHits++;
    return json(res, 500, { type: "error", error: { type: "api_error", message: "E2E: the model must not be called" } });
  }
  if (req.headers["x-api-key"] !== KEY) {
    stats.keyMismatches++;
    return json(res, 401, { error: { code: 401, message: "invalid key" } });
  }

  // ---------------- data host
  if (path === "/data/v3.0/data/hotels") return json(res, 200, load("hotels-list"));
  if (path === "/data/v3.0/data/hotel") {
    const id = url.searchParams.get("hotelId") ?? FIXTURE.hotel;
    return json(res, 200, adapt(load("hotel-details"), { hotelId: id }));
  }
  if (path === "/data/v3.0/data/reviews") return json(res, 200, load("reviews"));
  if (path === "/data/v3.0/hotels/min-rates" && req.method === "POST") {
    const body = await readBody(req);
    const base = load("min-rates").data;
    const data = (body.hotelIds ?? []).map((hotelId, i) => ({ ...base[i % base.length], hotelId }));
    return json(res, 200, { data, sandbox: true });
  }
  if (path === "/data/v3.0/hotels/rates" && req.method === "POST") {
    const body = await readBody(req);
    const hotelId = body.hotelIds?.[0] ?? FIXTURE.hotel;
    const stay = { hotelId, checkIn: body.checkin, checkOut: body.checkout, adults: body.occupancies?.[0]?.adults ?? 2 };
    const shift = days(FIXTURE.checkIn, stay.checkIn);
    const fx = load("rates");
    const data = adapt(fx.data, { shift, hotelId }).map((h) => ({
      ...h,
      roomTypes: h.roomTypes.map((rt, i) => ({ ...rt, offerId: encodeOffer({ ...stay, room: i }) })),
    }));
    return json(res, 200, { ...fx, data });
  }

  // ---------------- booking host
  if (path === "/book/v3.0/rates/prebook" && req.method === "POST") {
    const body = await readBody(req);
    const stay = decodeOffer(body.offerId);
    if (!stay) return json(res, 400, { error: { code: 4002, message: "invalid offer" } });
    const prebookId = `PB${++seq}`;
    prebooks.set(prebookId, stay);
    const data = adapt(load("prebook").data, { shift: days(FIXTURE.checkIn, stay.checkIn), hotelId: stay.hotelId });
    return json(res, 200, { data: { ...data, prebookId, offerId: body.offerId, checkin: stay.checkIn, checkout: stay.checkOut }, sandbox: true });
  }
  if (path === "/book/v3.0/rates/book" && req.method === "POST") {
    const body = await readBody(req);
    const stay = prebooks.get(body.prebookId);
    if (!stay) return json(res, 400, { error: { code: 4002, message: "unknown prebook" } });
    if ([...bookings.values()].some((b) => b.clientReference === body.clientReference)) {
      return json(res, 400, { error: { code: 4005, message: "duplicate booking attempt with existing client reference" } });
    }
    stats.books++;
    const id = `BK${String(++seq).padStart(6, "0")}`;
    const booking = registerBooking(id, { ...stay, prebookId: body.prebookId }, body.clientReference);
    return json(res, 200, { data: booking, sandbox: true });
  }
  if (path === "/book/v3.0/bookings" && req.method === "GET") {
    const ref = url.searchParams.get("clientReference");
    return json(res, 200, { data: [...bookings.values()].filter((b) => b.clientReference === ref) });
  }
  const one = /^\/book\/v3\.0\/bookings\/([A-Za-z0-9_-]+)$/.exec(path);
  if (one) {
    const booking = bookings.get(one[1]);
    if (!booking) return json(res, 404, { error: { code: 4008, message: "bookingId not found" } });
    if (req.method === "PUT") {
      booking.status = "CANCELLED";
      return json(res, 200, { data: { bookingId: booking.bookingId, cancellation_fee: 0, currency: "UAH", refund_amount: 1, status: "CANCELLED" }, sandbox: true });
    }
    return json(res, 200, { data: booking });
  }
  return json(res, 404, { error: { code: 404, message: `mock: no route for ${req.method} ${path}` } });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock LiteAPI on http://127.0.0.1:${PORT}`));
