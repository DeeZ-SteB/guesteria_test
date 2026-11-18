import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { boardLabel, includesBreakfast } from "./board";
import { cancellationText, formatKyivDateTime, parseCancelTime } from "./cancellation";
import { htmlToParagraphs } from "./text/html-to-text";

// Intl uses narrow no-break spaces in uk-UA; normalise for readable assertions.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("formats hryvnias without kopiyky", () => {
    expect(plain(formatMoney({ amount: 26648, currency: "UAH" }))).toBe("26 648 ₴");
  });

  it("rounds up so the shown price never drops below the suggested selling price", () => {
    expect(plain(formatMoney({ amount: 26648.01, currency: "UAH" }))).toBe("26 649 ₴");
  });
});

describe("boardLabel", () => {
  it("maps both breakfast codes seen in LiteAPI (docs: BB, sandbox: BI)", () => {
    expect(boardLabel("BB")).toBe("Сніданок включено");
    expect(boardLabel("BI", "Breakfast Included")).toBe("Сніданок включено");
    expect(includesBreakfast("BI")).toBe(true);
    expect(includesBreakfast("RO")).toBe(false);
  });

  it("strips per-person suffixes and falls back to the supplier name", () => {
    expect(boardLabel("HB2")).toBe("Напівпансіон");
    expect(boardLabel("XX", "Dinner")).toBe("Dinner");
  });
});

describe("parseCancelTime", () => {
  it("reads LiteAPI GMT times as UTC", () => {
    expect(parseCancelTime("2026-12-06 10:00:00", "GMT")).toBe("2026-12-06T10:00:00.000Z");
  });

  it("refuses unknown time zones and malformed input", () => {
    expect(parseCancelTime("2026-12-06 10:00:00", "Europe/Paris")).toBeNull();
    expect(parseCancelTime("06.12.2026", "GMT")).toBeNull();
  });
});

describe("cancellation text in Kyiv time", () => {
  it("is GMT+2 in winter", () => {
    expect(formatKyivDateTime("2026-12-06T10:00:00Z")).toBe("6 гру, 12:00");
  });

  it("is GMT+3 in summer (DST)", () => {
    expect(formatKyivDateTime("2026-07-06T10:00:00Z")).toBe("6 лип, 13:00");
  });

  it("promises free cancellation only while the deadline is in the future", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const free = (until: string | null) => ({ refundable: true, freeCancellationUntil: until });
    expect(cancellationText(free("2026-12-06T10:00:00Z"), now)).toBe("Безкоштовне скасування до 6 гру, 12:00");
    expect(cancellationText(free("2026-11-01T10:00:00Z"), now)).toBe("Без повернення коштів");
    expect(cancellationText(free(null), now)).toBe("Безкоштовне скасування");
    expect(cancellationText({ refundable: false, freeCancellationUntil: null }, now)).toBe("Без повернення коштів");
  });
});

describe("htmlToParagraphs", () => {
  it("turns supplier HTML into plain paragraphs", () => {
    expect(htmlToParagraphs("<p><strong>Luxurious</strong><br>Rooms &amp; spa</p><p>Near&nbsp;Opera</p>")).toEqual([
      "Luxurious",
      "Rooms & spa",
      "Near Opera",
    ]);
  });

  it("drops scripts and never returns markup", () => {
    const out = htmlToParagraphs('<p>Hi<script>alert(1)</script><img src=x onerror="x"></p>');
    expect(out).toEqual(["Hi"]);
  });

  // Found by the security-auditor agent: String.fromCodePoint throws on these.
  it("survives out-of-range and surrogate numeric entities", () => {
    expect(htmlToParagraphs("<p>A&#99999999;B&#x110000;C&#xD800;D</p>")).toEqual(["A\ufffdB\ufffdC\ufffdD"]);
  });

  it("removes invisible bidi and zero-width characters that could hide text from people", () => {
    expect(htmlToParagraphs("Safe&#8238;txet\u200b hidden")).toEqual(["Safetxet hidden"]);
  });

  it("handles empty input", () => {
    expect(htmlToParagraphs(null)).toEqual([]);
  });
});
