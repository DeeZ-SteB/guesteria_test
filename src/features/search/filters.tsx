"use client";

import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ViewState } from "@/lib/search/params";

type FiltersProps = {
  view: ViewState;
  onChange: (view: ViewState) => void;
  bounds: { min: number; max: number } | null;
};

const chip = (active: boolean) =>
  cn(
    "min-h-11 flex-1 rounded-button border px-3 text-sm font-medium transition-colors",
    active ? "border-2 border-primary bg-primary-soft text-primary-dark" : "border-line hover:border-primary",
  );

/** Shared by the mobile sheet (draft) and the desktop column (live). */
export function FiltersFields({ view, onChange, bounds }: FiltersProps) {
  const price = view.price ?? bounds;
  const uah = (amount: number) => formatMoney({ amount, currency: "UAH" });

  return (
    <div className="space-y-6 text-sm">
      {bounds && price && bounds.max > bounds.min && (
        <fieldset>
          <legend className="mb-2 font-semibold">Ціна за весь період</legend>
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-muted">Від {uah(price.min)}</span>
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={100}
                value={price.min}
                aria-valuetext={uah(price.min)}
                onChange={(e) => onChange({ ...view, price: { min: Math.min(Number(e.target.value), price.max), max: price.max } })}
                className="w-full accent-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">До {uah(price.max)}</span>
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={100}
                value={price.max}
                aria-valuetext={uah(price.max)}
                onChange={(e) => onChange({ ...view, price: { min: price.min, max: Math.max(Number(e.target.value), price.min) } })}
                className="w-full accent-primary"
              />
            </label>
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 font-semibold">Зірки</legend>
        <div className="flex gap-2">
          {[3, 4, 5].map((n) => {
            const active = view.stars.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={active}
                className={chip(active)}
                onClick={() =>
                  onChange({ ...view, stars: active ? view.stars.filter((s) => s !== n) : [...view.stars, n].sort() })
                }
              >
                {n}★
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">Оцінка гостей</legend>
        <div className="flex gap-2">
          {([null, 8, 9] as const).map((r) => (
            <button key={String(r)} type="button" aria-pressed={view.rating === r} className={chip(view.rating === r)} onClick={() => onChange({ ...view, rating: r })}>
              {r === null ? "Будь-яка" : `${r}+`}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
