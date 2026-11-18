"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { safeReturnTo } from "@/lib/return-to";
import { DemoButton, SignInForm, SignUpForm } from "./auth-forms";

export type AuthTab = "signin" | "signup";
type OpenOptions = { tab?: AuthTab; next?: string; title?: string };
type ModalState = { open: boolean; tab: AuthTab; next: string; title?: string };

type AuthModalApi = {
  open: (options?: OpenOptions) => void;
  /** Close after a successful sign-in and go to the (already sanitised) target. */
  finish: (redirectTo: string) => void;
};

const AuthModalContext = createContext<AuthModalApi | null>(null);

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) throw new Error("useAuthModal must be used inside <AuthModalProvider>");
  return context;
}

const TABS = [
  { value: "signin", label: "Вхід" },
  { value: "signup", label: "Реєстрація" },
] as const;

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ModalState>({ open: false, tab: "signin", next: "/" });

  const open = useCallback((options: OpenOptions = {}) => {
    const here = `${window.location.pathname}${window.location.search}`;
    setState({
      open: true,
      tab: options.tab ?? "signin",
      next: safeReturnTo(options.next ?? here),
      title: options.title,
    });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    // If the modal was opened from ?auth=…, drop those params so it does not reopen.
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth") || url.searchParams.has("next")) {
      url.searchParams.delete("auth");
      url.searchParams.delete("next");
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
  }, [router]);

  const finish = useCallback(
    (redirectTo: string) => {
      setState((s) => ({ ...s, open: false }));
      router.replace(safeReturnTo(redirectTo));
      // Re-render server components (header, account) with the new session cookie.
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ open, finish }), [open, finish]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <AuthUrlOpener onOpen={open} />
      </Suspense>
      <Sheet
        open={state.open}
        onClose={close}
        title={state.title ?? (state.tab === "signin" ? "Вхід у Guesteria Stay" : "Створити акаунт")}
        description="Поїздки й AI-асистент будуть доступні з будь-якого пристрою."
      >
        <Tabs
          label="Вхід або реєстрація"
          value={state.tab}
          onChange={(tab) => setState((s) => ({ ...s, tab }))}
          items={TABS}
        />
        <div className="mt-4">
          {state.tab === "signin" ? <SignInForm next={state.next} /> : <SignUpForm next={state.next} />}
        </div>
        <div className="my-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          або
          <span className="h-px flex-1 bg-line" />
        </div>
        <DemoButton next={state.next} />
      </Sheet>
    </AuthModalContext.Provider>
  );
}

/** Opens the modal when the URL carries ?auth=signin|signup (e.g. after a protected-page redirect). */
function AuthUrlOpener({ onOpen }: { onOpen: (options: OpenOptions) => void }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const auth = params.get("auth");
  const next = params.get("next");

  useEffect(() => {
    if (auth === "signin" || auth === "signup") {
      onOpen({
        tab: auth,
        next: next ?? pathname,
        title: next ? "Увійдіть, щоб продовжити" : undefined,
      });
    }
  }, [auth, next, pathname, onOpen]);

  return null;
}
