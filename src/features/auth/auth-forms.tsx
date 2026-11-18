"use client";

import { useActionState, useEffect } from "react";
import { CirclePlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signInAsDemo, signUp, type AuthFormState } from "./actions";
import { useAuthModal } from "./auth-modal";
import { PASSWORD_MIN } from "./schemas";

const initial: AuthFormState = {};

/** Closes the modal and navigates once an action reports success. */
function useFinishOnSuccess(state: AuthFormState) {
  const { finish } = useAuthModal();
  useEffect(() => {
    if (state.redirectTo) finish(state.redirectTo);
  }, [state, finish]);
}

function FormMessage({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="rounded-button bg-primary-soft px-3 py-2 text-sm text-primary-dark">
        {state.notice}
      </p>
    );
  }
  return null;
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  useFinishOnSuccess(state);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <Input
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Увійти
      </Button>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  useFinishOnSuccess(state);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Input
        label="Ім'я"
        name="firstName"
        autoComplete="given-name"
        defaultValue={state.values?.firstName}
        error={state.fieldErrors?.firstName}
        required
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <Input
        label="Пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`Щонайменше ${PASSWORD_MIN} символів`}
        error={state.fieldErrors?.password}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Створити акаунт
      </Button>
    </form>
  );
}

export function DemoButton({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAsDemo, initial);
  useFinishOnSuccess(state);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Button type="submit" variant="outline" size="lg" fullWidth loading={pending}>
        {!pending && <CirclePlay className="size-5" aria-hidden />}
        Увійти як демо
      </Button>
    </form>
  );
}
