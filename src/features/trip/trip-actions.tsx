"use client";

import { useState, useTransition, type ReactNode } from "react";
import { BellRing, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import {
  ARRIVAL_SLOTS,
  DETAILS_REQUIRED,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPES,
  defaultArrival,
  isEarlierThan,
  openTypes,
  type GuestRequestView,
  type RequestType,
} from "@/lib/booking/trip-page";
import { formatKyivDateTime } from "@/lib/cancellation";
import type { CheckinView } from "./schemas";
import { createGuestRequest, saveCheckin, type CreateRequestResult, type SaveCheckinResult } from "./actions";
import { useGuestRequests, type LiveState } from "./use-guest-requests";
import { newUuid } from "@/lib/id/uuid";

function Card({ id, title, icon, children, aside }: { id: string; title: string; icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-card border border-line bg-surface p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-bold">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const CHECKIN_ERRORS: Record<Exclude<SaveCheckinResult, { ok: true }>["reason"], string> = {
  invalid: "Перевірте дані форми.",
  session: "Сесія завершилась. Увійдіть знову.",
  not_found: "Бронювання не знайдено.",
  closed: "Чекін уже закрито для цього бронювання.",
  retry: "Не вдалося зберегти. Спробуйте ще раз.",
};

const REQUEST_ERRORS: Record<Exclude<CreateRequestResult, { ok: true }>["reason"], string> = {
  invalid: "Перевірте дані запиту.",
  session: "Сесія завершилась. Увійдіть знову.",
  not_found: "Бронювання не знайдено.",
  closed: "Запити для цього бронювання вже закрито.",
  type_closed: "Цей запит уже неактуальний для ваших дат.",
  duplicate_open: "Такий запит уже чекає відповіді готелю.",
  limit: "Досягнуто ліміт запитів для цього бронювання. Напишіть у підтримку.",
  retry: "Не вдалося надіслати. Спробуйте ще раз.",
};

const STATUS_TONE = {
  sent: "bg-accent/10 text-accent",
  confirmed: "bg-success/10 text-success",
  declined: "bg-danger/10 text-danger",
} as const;

export type TripActionsProps = {
  bookingId: string;
  checkin: CheckinView | null;
  checkinEditable: boolean;
  requests: GuestRequestView[];
  /** Request types that can still be asked (empty when the trip is read-only). */
  availableTypes: RequestType[];
  live: boolean;
  hotelCheckIn: string | null;
  checkinError?: boolean;
  requestsError?: boolean;
};

/** Online check-in and requests to the hotel: one client island so the check-in hint can open a request. */
export function TripActions(props: TripActionsProps) {
  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const live = useGuestRequests(props.bookingId, props.requests, props.live);
  // The shortcut only when an early check-in can still be asked and none is waiting for an answer.
  const canAskEarly = props.availableTypes.includes("early_check_in") && !openTypes(live.requests).has("early_check_in");
  return (
    <>
      {/* Keyed by the stored values: a check-in confirmed in the AI chat (router.refresh) replaces stale local state. */}
      <CheckinCard
        key={`${props.checkin?.arrivalTime ?? ""}|${props.checkin?.notes ?? ""}`}
        {...props}
        onEarlyRequest={canAskEarly ? () => setRequestType("early_check_in") : undefined}
      />
      <GuestRequests {...props} {...live} requestType={requestType} setRequestType={setRequestType} />
    </>
  );
}

// ---------------------------------------------------------------- check-in

function CheckinCard({
  bookingId,
  checkin: initial,
  checkinEditable,
  hotelCheckIn,
  checkinError,
  onEarlyRequest,
}: TripActionsProps & { onEarlyRequest?: () => void }) {
  const [checkin, setCheckin] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [arrival, setArrival] = useState(initial?.arrivalTime ?? defaultArrival(hotelCheckIn));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const done = checkin !== null;
  const badge = done ? (
    <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
      <CheckCircle2 className="size-3.5" aria-hidden />
      Чекін пройдено
    </span>
  ) : (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Не пройдено</span>
  );

  if (checkinError) {
    return (
      <Card id="checkin" title="Онлайн-чекін" icon={<Clock className="size-4 text-primary" aria-hidden />}>
        <p role="alert" className="text-sm text-danger">
          Не вдалося завантажити чекін. Оновіть сторінку.
        </p>
      </Card>
    );
  }

  if (!checkinEditable && !done) {
    return (
      <Card id="checkin" title="Онлайн-чекін" icon={<Clock className="size-4 text-primary" aria-hidden />} aside={badge}>
        <p className="text-sm text-muted">Онлайн-чекін для цього бронювання вже недоступний.</p>
      </Card>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    startTransition(async () => {
      const result = await saveCheckin({ bookingId, arrivalTime: arrival, notes });
      if (result.ok) {
        setCheckin(result.checkin);
        setNotes(result.checkin.notes);
        setEditing(false);
        return;
      }
      setFieldError(result.fieldErrors?.notes ?? null);
      setError(CHECKIN_ERRORS[result.reason]);
    });
  };

  return (
    <Card id="checkin" title="Онлайн-чекін" icon={<Clock className="size-4 text-primary" aria-hidden />} aside={badge}>
      <p aria-live="polite" role="status" className={error ? "mb-3 rounded-button bg-danger/10 px-3 py-2 text-sm text-danger" : "sr-only"}>
        {error ?? ""}
      </p>
      {done && !editing ? (
        <div className="space-y-2 text-sm">
          <p>
            Прибуття о <b>{checkin.arrivalTime}</b>
          </p>
          {checkin.notes && <p className="whitespace-pre-line text-muted">{checkin.notes}</p>}
          <p className="text-xs text-muted">Готель отримав ваші дані. Документи покажете на рецепції.</p>
          {checkinEditable && (
            <Button variant="ghost" onClick={() => setEditing(true)} className="-ml-3">
              Змінити
            </Button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm text-muted">Пройдіть чекін заздалегідь — на рецепції залишиться лише показати документ.</p>
          <div>
            <label htmlFor="arrival" className="text-xs font-medium text-muted">
              Час прибуття
            </label>
            <select
              id="arrival"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-button border border-line bg-surface px-3 text-base"
            >
              {ARRIVAL_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            {hotelCheckIn && <p className="mt-1 text-xs text-muted">Заселення в готелі з {hotelCheckIn}</p>}
          </div>
          {isEarlierThan(arrival, hotelCheckIn) && (
            <p className="rounded-button bg-primary-soft p-3 text-sm text-primary-dark">
              Ви приїдете раніше часу заселення.{" "}
              {onEarlyRequest && (
                <button type="button" onClick={onEarlyRequest} className="font-semibold underline">
                  Попросити ранній заїзд
                </button>
              )}
            </p>
          )}
          <div>
            <label htmlFor="notes" className="text-xs font-medium text-muted">
              Побажання (необовʼязково)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              aria-describedby="notes-hint"
              aria-invalid={fieldError ? true : undefined}
              placeholder="Тихий номер, дитяче ліжечко…"
              className="mt-1 w-full rounded-button border border-line bg-surface px-3 py-2 text-base"
            />
            <p id="notes-hint" className={cn("mt-1 text-xs", fieldError ? "text-danger" : "text-muted")}>
              {fieldError ?? `${notes.length}/500`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              {done ? "Зберегти" : "Пройти чекін"}
            </Button>
            {done && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                Скасувати
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- requests

function GuestRequests({
  bookingId,
  requests,
  add,
  connection,
  availableTypes,
  live,
  requestsError,
  requestType,
  setRequestType,
}: TripActionsProps & {
  add: (row: GuestRequestView) => void;
  connection: LiveState;
  requestType: RequestType | null;
  setRequestType: (t: RequestType | null) => void;
}) {
  const open = openTypes(requests);
  const canAsk = availableTypes.length > 0;

  return (
    <Card
      id="requests"
      title="Запити до готелю"
      icon={<BellRing className="size-4 text-primary" aria-hidden />}
      aside={
        live ? (
          <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
            <span className={cn("size-2 rounded-full", connection === "live" ? "bg-success" : connection === "connecting" ? "bg-accent" : "bg-danger")} aria-hidden />
            {connection === "live" ? "Оновлюється наживо" : connection === "connecting" ? "Підключення…" : "Немає звʼязку"}
          </span>
        ) : undefined
      }
    >
      {canAsk && (
        <div className="mb-4 flex flex-wrap gap-2">
          {REQUEST_TYPES.filter((t) => availableTypes.includes(t)).map((type) => {
            const waiting = open.has(type);
            return (
              <button
                key={type}
                type="button"
                disabled={waiting}
                onClick={() => setRequestType(type)}
                className="min-h-10 rounded-full border border-line px-3 text-sm font-medium hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line disabled:hover:bg-transparent"
              >
                {REQUEST_TYPE_LABEL[type]}
                {waiting && <span className="ml-1 text-xs text-muted">· очікує відповіді</span>}
              </button>
            );
          })}
        </div>
      )}

      {requestsError && requests.length === 0 ? (
        <p role="alert" className="text-sm text-danger">
          Не вдалося завантажити запити. Оновіть сторінку.
        </p>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Запитів ще немає"
          text={canAsk ? "Ранній заїзд, трансфер чи сніданок у номер — готель відповість тут." : undefined}
          className="py-6"
        />
      ) : (
        <ul className="divide-y divide-line" role="list">
          {requests.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {REQUEST_TYPE_LABEL[r.type]}
                  {r.source === "assistant" && (
                    <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">
                      <Sparkles className="size-3" aria-hidden />
                      створено AI
                    </span>
                  )}
                </p>
                {r.details && <p className="mt-0.5 whitespace-pre-line break-words text-muted">{r.details}</p>}
                <p className="mt-0.5 text-xs text-muted">{formatKyivDateTime(r.createdAt)}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>{REQUEST_STATUS_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}

      <RequestSheet
        key={requestType ?? "closed"}
        bookingId={bookingId}
        type={requestType}
        onClose={() => setRequestType(null)}
        onCreated={(row) => {
          add(row);
          setRequestType(null);
        }}
      />
    </Card>
  );
}

function RequestSheet({
  bookingId,
  type,
  onClose,
  onCreated,
}: {
  bookingId: string;
  type: RequestType | null;
  onClose: () => void;
  onCreated: (row: GuestRequestView) => void;
}) {
  // One id per opened form: a double click or a retry cannot create two requests.
  const [requestId] = useState(() => newUuid());
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const required = type ? DETAILS_REQUIRED.has(type) : false;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!type) return;
    setError(null);
    startTransition(async () => {
      const result = await createGuestRequest({ requestId, bookingId, type, details });
      if (result.ok) onCreated(result.request);
      else setError(result.fieldErrors?.details ?? REQUEST_ERRORS[result.reason]);
    });
  };

  return (
    <Sheet open={type !== null} onClose={() => !pending && onClose()} title={type ? REQUEST_TYPE_LABEL[type] : ""} description="Готель відповість тут — статус оновиться автоматично.">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p aria-live="polite" role="status" className={error ? "rounded-button bg-danger/10 px-3 py-2 text-sm text-danger" : "sr-only"}>
          {error ?? ""}
        </p>
        <div>
          <label htmlFor="request-details" className="text-xs font-medium text-muted">
            {required ? "Деталі" : "Деталі (необовʼязково)"}
          </label>
          <textarea
            id="request-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={type === "transfer" ? "Звідки, коли, скільки людей" : type === "early_check_in" ? "О котрій плануєте приїхати" : ""}
            className="mt-1 w-full rounded-button border border-line bg-surface px-3 py-2 text-base"
          />
          <p className="mt-1 text-xs text-muted">{details.length}/500</p>
        </div>
        <Button type="submit" size="lg" fullWidth loading={pending}>
          Надіслати запит
        </Button>
      </form>
    </Sheet>
  );
}
