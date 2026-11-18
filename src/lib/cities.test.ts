import { describe, expect, it } from "vitest";
import { CITIES, findCity, searchCities } from "./cities";

describe("cities", () => {
  it("has unique ids", () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
  });

  it("uses LiteAPI's exact spelling (with the ʼ apostrophe) for Ukrainian names", () => {
    expect(findCity("ternopil")?.cityName).toBe("Ternopilʼ");
    expect(findCity("ivano-frankivsk")?.cityName).toBe("Ivano-Frankivsʼk");
  });

  it("finds cities by Ukrainian or English prefix, case-insensitive", () => {
    expect(searchCities("льв")[0].id).toBe("lviv");
    expect(searchCities("LVI")[0].id).toBe("lviv");
    expect(searchCities("прага")[0].id).toBe("prague");
  });

  it("ranks prefix matches before substring matches", () => {
    // "ри" starts "Рига" and "Рим", and appears inside "Париж".
    const result = searchCities("ри").map((c) => c.id);
    expect(result.slice(0, 2).sort()).toEqual(["riga", "rome"]);
    expect(result.indexOf("paris")).toBeGreaterThan(1);
  });

  it("ignores apostrophes in the query", () => {
    expect(searchCities("тернопіл")[0].id).toBe("ternopil");
  });

  it("suggests popular cities for an empty query", () => {
    expect(searchCities("").every((c) => c.popular)).toBe(true);
  });
});
