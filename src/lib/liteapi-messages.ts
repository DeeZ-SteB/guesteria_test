export type LiteApiErrorKind =
  | "no_availability"
  | "unauthorized"
  | "invalid_request"
  | "timeout"
  | "network"
  | "upstream"
  | "unknown";

const MESSAGES: Record<LiteApiErrorKind, string> = {
  no_availability: "Немає вільних номерів на ці дати. Спробуйте інші дати.",
  unauthorized: "Сервіс бронювання тимчасово недоступний. Спробуйте пізніше.",
  invalid_request: "Не вдалося виконати запит. Перевірте параметри й спробуйте ще.",
  timeout: "Сервіс відповідає надто довго. Спробуйте ще раз.",
  network: "Немає зв'язку із сервісом бронювання. Перевірте з'єднання.",
  upstream: "Сервіс бронювання повернув помилку. Спробуйте ще раз.",
  unknown: "Щось пішло не так. Спробуйте ще раз.",
};

/** User-facing Ukrainian copy for a LiteAPI failure. Never shows raw supplier messages. */
export function liteApiErrorMessage(kind: LiteApiErrorKind): string {
  return MESSAGES[kind];
}
