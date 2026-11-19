"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkoutErrorMessage } from "@/lib/booking/checkout";
import { confirmBooking, type CheckoutFormState } from "./actions";

const initialState: CheckoutFormState = {};

export function GuestForm({
  token,
  total,
  initial,
}: {
  token: string;
  total: string;
  initial: { firstName: string; lastName: string; email: string };
}) {
  const [state, action, pending] = useActionState(confirmBooking, initialState);
  const values = state.values ?? initial;
  // Retries must reuse the token of the attempt, even if the page re-rendered with a new quote.
  const activeToken = state.token ?? token;
  const label =
    state.error === "pending" ? "Перевірити ще раз" : state.error === "unsaved" ? "Зберегти бронювання" : `Підтвердити бронювання · ${total}`;

  return (
    <form id="checkout-form" action={action} noValidate className="space-y-3 rounded-card border border-line bg-surface p-4 md:p-5">
      <h2 className="text-base font-bold">Дані гостя</h2>
      <input type="hidden" name="token" value={activeToken} />
      {state.error && (
        <p role="alert" className="rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
          {checkoutErrorMessage(state.error)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Ім'я" name="firstName" autoComplete="given-name" defaultValue={values.firstName} error={state.fieldErrors?.firstName} required />
        <Input label="Прізвище" name="lastName" autoComplete="family-name" defaultValue={values.lastName} error={state.fieldErrors?.lastName} required />
      </div>
      <Input
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={values.email}
        hint="Сюди надійде підтвердження"
        error={state.fieldErrors?.email}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={pending} className="hidden md:inline-flex">
        {label}
      </Button>

      {/* Phones: the confirm button sticks above the tab bar. */}
      <div
        data-sticky-cta
        className="fixed inset-x-0 z-30 flex h-[72px] items-center border-t border-line bg-surface px-4 bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] md:hidden"
      >
        <Button type="submit" form="checkout-form" size="lg" fullWidth loading={pending}>
          {label}
        </Button>
      </div>
    </form>
  );
}
