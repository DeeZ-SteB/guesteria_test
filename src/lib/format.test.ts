import { describe, expect, it } from "vitest";
import { adultsLabel, formatDateRange, formatShortDate, hotelsFoundLabel, nightsLabel, pluralUk, reviewsLabel } from "./format";
import { formatRating, ratingLabel } from "./rating";
import { addDays, adjustCheckOut, defaultStay } from "./booking/stay";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("pluralUk", () => {
  it.each([
    [1, "ніч"], [2, "ночі"], [4, "ночі"], [5, "ночей"], [11, "ночей"], [12, "ночей"], [14, "ночей"], [21, "ніч"], [22, "ночі"], [25, "ночей"],
  ])("%i → %s", (n, word) => {
    expect(pluralUk(n, ["ніч", "ночі", "ночей"])).toBe(word);
  });
});

describe("labels", () => {
  it("builds Ukrainian phrases", () => {
    expect(nightsLabel(3)).toBe("3 ночі");
    expect(adultsLabel(1)).toBe("1 дорослий");
    expect(adultsLabel(2)).toBe("2 дорослих");
    expect(hotelsFoundLabel(21)).toBe("Знайдено 21 готель");
    expect(hotelsFoundLabel(47)).toBe("Знайдено 47 готелів");
    expect(plain(reviewsLabel(1240))).toBe("1 240 відгуків");
  });
});

describe("dates", () => {
  it("formats ranges within and across months", () => {
    expect(formatDateRange("2026-12-12", "2026-12-15")).toBe("12–15 гру");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 гру – 2 січ");
  });

  it("formats a short date with weekday", () => {
    expect(formatShortDate("2026-12-12")).toBe("12 гру, сб");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("suggests a default stay two weeks ahead", () => {
    expect(defaultStay("2026-11-18")).toEqual({ checkIn: "2026-12-02", checkOut: "2026-12-05", adults: 2 });
  });

  it("moves check-out when the new check-in passes it, keeping the stay length", () => {
    expect(adjustCheckOut("2026-12-20", "2026-12-15", 3)).toBe("2026-12-23");
    expect(adjustCheckOut("2026-12-12", "2026-12-15")).toBe("2026-12-15");
    expect(adjustCheckOut("2026-12-01", "2027-02-01", 3)).toBe("2026-12-04");
  });
});

describe("rating", () => {
  it("labels and formats ratings", () => {
    expect(ratingLabel(9.3)).toBe("Чудово");
    expect(ratingLabel(8)).toBe("Дуже добре");
    expect(ratingLabel(7.2)).toBe("Добре");
    expect(ratingLabel(5)).toBe("Оцінка");
    expect(ratingLabel(null)).toBe("Без оцінок");
    expect(formatRating(8.9)).toBe("8,9");
    expect(formatRating(9)).toBe("9,0");
  });
});
