export type Money = { amount: number; currency: string };

/**
 * Whole units, rounded up. Rounding up keeps a displayed price at or above
 * LiteAPI's suggested selling price, which is the floor for public prices.
 */
export function formatMoney({ amount, currency }: Money): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.ceil(amount));
}

/** Rounds to kopiyky to avoid float noise such as 0.1 + 0.2. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
