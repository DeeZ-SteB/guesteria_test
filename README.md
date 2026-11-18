# Guesteria Stay

Мобільна вебверсія сервісу бронювання готелів (у стилі Booking) з цифровим консьєржем для поїздки гостя.
Тестове завдання для Guesteria.

- **Дані:** LiteAPI (Nuitee): пошук, тарифи, готелі, відгуки, бронювання
- **AI:** Claude API: консьєрж у розділі «Моя поїздка»
- **Стек:** Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Auth + Postgres + RLS) · Zod · Vitest · pgTAP
- **Хостинг:** Vercel (застосунок) + Supabase Cloud (база), деплой через GitHub Actions

## Швидкий старт (локально)

Потрібно: Node 22+, Docker Desktop.

```bash
npm install
npm run db:start          # Supabase у Docker (перший запуск тягне образи)
npm run db:status         # ключі для .env
cp .env.example .env      # вписати NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY і SUPABASE_SECRET_KEY
npm run dev               # http://localhost:8700
```

Перевірка: `curl localhost:8700/api/health` → `{"status":"ok","supabase":"ok"}`.

### Варіанти запуску

| Команда | Що запускає | Порт |
|---|---|---|
| `npm run dev` | Next.js dev на хості (найшвидший hot reload, рекомендовано) | 8700 |
| `npm run docker:dev` | Next.js dev у Docker | 8701 |
| `npm run docker:up` | Production-образ у Docker (як на проді) | 8780 |
| `npm run db:start` | Supabase: API / Postgres / Studio / пошта | 8721 / 8722 / 8723 / 8724 |

Усі порти в блоці **87xx**, щоб не перетинатися з іншими локальними проєктами.
Контейнери застосунку приєднуються до мережі Supabase (`supabase_network_guesteria`), тому спочатку запускай `npm run db:start`.

Листи підтвердження й посилання для входу локально приходять у Mailpit: http://localhost:8724.

## Перевірки

```bash
npm run lint
npm run typecheck
npm test                  # юніт-тести (Vitest)
npx supabase test db      # RLS-тести (pgTAP): користувач B не бачить даних A
```

## CI/CD

`.github/workflows/ci-cd.yml`:

```
PR   → lint · types · unit · build ─┐
       migrations · RLS tests ──────┼→ Vercel preview (посилання в коментарі PR)
       docker build ────────────────┘
main → ті самі перевірки → supabase db push → Vercel production
```

`.github/workflows/claude-review.yml`: незалежне AI-рев'ю кожного PR з inline-коментарями.

Розробка ведеться локально, а в GitHub потрапляє лише через PR. Деплой робить тільки CI.

### Секрети GitHub (Settings → Secrets and variables → Actions)

| Секрет | Звідки |
|---|---|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `.vercel/project.json` після `npx vercel link` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_PROJECT_ID` | Project Settings → General → Reference ID |
| `SUPABASE_DB_PASSWORD` | пароль бази, заданий при створенні проєкту |
| `ANTHROPIC_API_KEY` | console.anthropic.com (для AI-рев'ю) |

Без секретів кроки деплою пропускаються, а перевірки працюють.

Змінні оточення застосунку (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LITEAPI_KEY`, `ANTHROPIC_API_KEY`) задаються в Vercel → Project → Settings → Environment Variables.

## AI-пайплайн

| Шар | Що | Де |
|---|---|---|
| Правила | Стек, порти, правила безпеки для всіх агентів | `CLAUDE.md` |
| Агенти | `planner`, `test-writer`, `code-reviewer`, `security-auditor` | `.claude/agents/` |
| Оркестрація | `/feature <опис>`: план → код → тести → незалежне рев'ю → PR | `.claude/commands/feature.md` |
| Автоматичні перевірки | ESLint після кожної правки; агент не може завершити роботу з червоними типами чи тестами | `.claude/settings.json`, `.claude/hooks/` |
| CI | Перевірки, RLS-тести, Docker, AI-рев'ю PR | `.github/workflows/` |
| Журнал | Де AI помилився і що виправлено вручну | `docs/AI_LOG.md` |

## Захист даних

- Ключі LiteAPI, Claude і секретний ключ Supabase є лише на сервері. Браузер отримує тільки публічний ключ.
- RLS на всіх таблицях: користувач бачить лише свої бронювання, обране й запити.
- Бронювання в базу записує тільки сервер після підтвердження LiteAPI, тож клієнт не може підробити бронювання.
- LiteAPI повертає всі бронювання для API-ключа, тому належність бронювання перевіряється за нашою таблицею `bookings`.
- Усі вхідні дані проходять валідацію через Zod.
