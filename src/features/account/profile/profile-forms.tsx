"use client";

import { useActionState, useState, type ReactNode } from "react";
import { LogOut, ShieldAlert, Trash2 } from "lucide-react";
import type { AccountProfile } from "@/server/auth";
import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { changePassword, deleteAccount, updateProfile, type AccountFormState } from "../actions";
import { DELETE_WORD } from "../schemas";

const initial: AccountFormState = {};

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-4 md:p-5">
      <h2 id={id} className="mb-3 text-base font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Status({ state }: { state: AccountFormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.notice)
    return (
      <p role="status" className="rounded-button bg-success/10 px-3 py-2 text-sm text-success-ink">
        {state.notice}
      </p>
    );
  return null;
}

const LANGUAGES = [
  { value: "auto", label: "Авто" },
  { value: "uk", label: "Українська" },
  { value: "en", label: "English" },
] as const;

export function ProfileForms({ profile }: { profile: AccountProfile }) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfile, initial);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, initial);
  const [deleting, setDeleting] = useState(false);
  const locked = profile.isDemo;
  const v = profileState.values ?? {};
  const language = v.aiLanguage ?? profile.aiLanguage;

  return (
    <div className="space-y-4">
      {locked && (
        <p className="flex gap-2 rounded-button border border-accent/40 bg-accent/10 p-3 text-sm" role="status">
          <ShieldAlert className="size-5 shrink-0 text-accent-ink" aria-hidden />
          Це спільний демо-акаунт: профіль, пароль і видалення вимкнено. Бронювання та скасування працюють.
        </p>
      )}

      <Card title="Особисті дані" id="profile-data">
        <form action={profileAction} className="space-y-3" noValidate>
          <Status state={profileState} />
          <fieldset disabled={locked} className="space-y-3">
            <Input label="Email" value={profile.email} readOnly disabled hint="Email змінити не можна" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Ім'я" name="firstName" autoComplete="given-name" defaultValue={v.firstName ?? profile.firstName} error={profileState.fieldErrors?.firstName} required maxLength={50} />
              <Input label="Прізвище" name="lastName" autoComplete="family-name" defaultValue={v.lastName ?? profile.lastName} error={profileState.fieldErrors?.lastName} maxLength={50} />
            </div>
            <Input
              label="Телефон"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+380"
              defaultValue={v.phone ?? profile.phone}
              error={profileState.fieldErrors?.phone}
              hint="Для зв'язку з готелем"
              maxLength={24}
            />
            <div role="radiogroup" aria-labelledby="ai-lang-label">
              <p id="ai-lang-label" className="text-xs font-medium text-muted">
                Мова AI-асистента
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <label key={l.value} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-dark">
                    <input type="radio" name="aiLanguage" value={l.value} defaultChecked={language === l.value} className="accent-primary" />
                    {l.label}
                  </label>
                ))}
              </div>
              {profileState.fieldErrors?.aiLanguage && <p className="mt-1 text-xs text-danger">{profileState.fieldErrors.aiLanguage}</p>}
            </div>
            <Button type="submit" loading={profilePending}>
              Зберегти
            </Button>
          </fieldset>
        </form>
      </Card>

      <Card title="Пароль" id="profile-password">
        <form action={passwordAction} className="space-y-3" noValidate key={passwordState.notice ?? "pw"}>
          <Status state={passwordState} />
          <fieldset disabled={locked} className="space-y-3">
            <Input label="Поточний пароль" name="currentPassword" type="password" autoComplete="current-password" error={passwordState.fieldErrors?.currentPassword} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Новий пароль" name="newPassword" type="password" autoComplete="new-password" error={passwordState.fieldErrors?.newPassword} required />
              <Input label="Повторіть новий пароль" name="confirm" type="password" autoComplete="new-password" error={passwordState.fieldErrors?.confirm} required />
            </div>
            <Button type="submit" variant="outline" loading={passwordPending}>
              Змінити пароль
            </Button>
          </fieldset>
        </form>
      </Card>

      <Card title="Акаунт" id="profile-danger">
        <div className="flex flex-col gap-2 sm:flex-row">
          <form action={signOut}>
            <Button type="submit" variant="ghost" fullWidth>
              <LogOut className="size-4" aria-hidden />
              Вийти
            </Button>
          </form>
          <Button variant="danger" onClick={() => setDeleting(true)} disabled={locked}>
            <Trash2 className="size-4" aria-hidden />
            Видалити акаунт
          </Button>
        </div>
      </Card>

      <Sheet open={deleting} onClose={() => !deletePending && setDeleting(false)} title="Видалити акаунт?" description="Профіль, обране та історія поїздок буде видалено назавжди.">
        <form action={deleteAction} className="space-y-3" noValidate>
          <Status state={deleteState} />
          <p className="text-sm text-muted">Майбутні бронювання спершу потрібно скасувати.</p>
          <Input label="Поточний пароль" name="currentPassword" type="password" autoComplete="current-password" error={deleteState.fieldErrors?.currentPassword} required />
          <Input label={`Введіть ${DELETE_WORD} для підтвердження`} name="confirm" autoComplete="off" autoCapitalize="characters" error={deleteState.fieldErrors?.confirm} required />
          <Button type="submit" size="lg" fullWidth loading={deletePending} className="bg-danger text-on-danger hover:bg-danger/90">
            Видалити назавжди
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
