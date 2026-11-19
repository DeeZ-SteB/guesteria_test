import Link from "next/link";
import { BadgeCheck, CalendarCheck, MessageCircleHeart, Quote, ShieldCheck, Sparkles } from "lucide-react";
import { HotelImage } from "@/components/ui/hotel-image";
import { RatingBadge, Stars } from "@/components/ui/rating";
import { Skeleton } from "@/components/ui/feedback";
import { findCity } from "@/lib/cities";
import { defaultStay } from "@/lib/booking/stay";
import { hotelHref, searchHref } from "@/lib/search/params";
import { reviewsLabel } from "@/lib/format";
import { getHomeShowcase } from "./data";

const TILE_GRADIENTS = ["from-teal-700 to-teal-400", "from-blue-900 to-blue-400", "from-amber-700 to-amber-400", "from-violet-800 to-violet-400"];

/** The hero's background: the best-rated hotel photo of the first popular city. */
export async function HeroPhoto() {
  const { hero } = await getHomeShowcase();
  if (!hero?.photo) return null;
  return <HotelImage src={hero.photo} alt="" sizes="100vw" eager className="object-cover" />;
}

export async function PopularCities({ today }: { today: string }) {
  const { cities } = await getHomeShowcase();
  const stay = defaultStay(today);
  return (
    <section aria-labelledby="popular-title">
      <SectionTitle id="popular-title" title="Популярні напрямки" subtitle="Куди найчастіше їдуть наші гості" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" role="list">
        {cities.map((c, i) => {
          const city = findCity(c.cityId);
          if (!city) return null;
          return (
            <li key={c.cityId}>
              <Link
                href={searchHref({ cityId: city.id, ...stay })}
                className={`group relative flex h-36 items-end overflow-hidden rounded-card bg-gradient-to-br p-3 text-white md:h-44 ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}
              >
                {c.photo && <HotelImage src={c.photo} alt="" sizes="(min-width:768px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
                <span className="relative">
                  <span className="block text-lg font-bold leading-tight">{city.nameUk}</span>
                  <span className="block text-xs opacity-90">
                    {city.countryUk}
                    {c.hotelCount > 0 && ` · ${c.hotelCount}+ готелів`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export async function TopHotels({ today }: { today: string }) {
  const { top } = await getHomeShowcase();
  if (top.length === 0) return null;
  const stay = defaultStay(today);
  return (
    <section aria-labelledby="top-title">
      <SectionTitle id="top-title" title="Найкращі за відгуками гостей" subtitle="Високий рейтинг і сотні відгуків" />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0" role="list">
        {top.map((h) => {
          const city = findCity(h.cityId);
          return (
            <li key={h.id} className="w-64 shrink-0 snap-start md:w-auto">
              <Link href={hotelHref(h.id, { ...stay, cityId: h.cityId })} className="group block overflow-hidden rounded-card border border-line bg-surface hover:border-primary">
                <div className="relative aspect-[4/3] bg-line">
                  <HotelImage src={h.photo} alt="" sizes="(min-width:768px) 25vw, 256px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3">
                  <Stars count={h.stars} />
                  <p className="mt-0.5 truncate font-semibold">{h.name}</p>
                  <p className="text-xs text-muted">{city ? `${city.nameUk}, ${city.countryUk}` : ""}</p>
                  {h.rating !== null && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <RatingBadge rating={h.rating} />
                      {reviewsLabel(h.reviewCount)}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export async function GuestReviews({ today }: { today: string }) {
  const { reviews } = await getHomeShowcase();
  if (reviews.length === 0) return null;
  const stay = defaultStay(today);
  return (
    <section aria-labelledby="reviews-title">
      <SectionTitle id="reviews-title" title="Що кажуть гості" subtitle="Справжні відгуки про готелі з нашого каталогу" />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" role="list">
        {reviews.map((r) => (
          <li key={r.id} className="flex flex-col rounded-card border border-line bg-surface p-4">
            <Quote className="size-5 text-primary" aria-hidden />
            <p className="mt-2 flex-1 text-sm leading-relaxed">{r.text}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <Link href={hotelHref(r.hotelId, { ...stay, cityId: r.cityId })} className="block truncate text-primary hover:underline">
                  {r.hotelName}
                </Link>
              </span>
              <RatingBadge rating={r.score} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const BENEFITS = [
  { icon: Sparkles, title: "AI-консьєрж", text: "Підбере готель за описом, відповість про правила й зручності." },
  { icon: CalendarCheck, title: "Онлайн-чекін", text: "Час прибуття й побажання — заздалегідь, без черги на рецепції." },
  { icon: MessageCircleHeart, title: "Запити до готелю", text: "Ранній заїзд, трансфер, сніданок у номер — зі статусом наживо." },
  { icon: ShieldCheck, title: "Чесні умови", text: "Ціна з податками й дедлайн безкоштовного скасування — одразу." },
];

export function WhyGuesteria() {
  return (
    <section aria-labelledby="why-title" className="rounded-card bg-primary-soft p-4 md:p-6">
      <h2 id="why-title" className="flex items-center gap-2 text-lg font-bold text-primary-dark">
        <BadgeCheck className="size-5" aria-hidden />
        Чому Guesteria
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold text-primary-dark">{title}</span>
              <span className="block text-sm text-primary-dark">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg font-bold md:text-title">
        {title}
      </h2>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  );
}

export function SectionSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div aria-hidden>
      <Skeleton className="mb-3 h-6 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={tall ? "h-56 rounded-card" : "h-36 rounded-card"} />
        ))}
      </div>
    </div>
  );
}
