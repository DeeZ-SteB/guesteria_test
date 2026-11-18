import { getCurrentUser } from "@/server/auth";
import { getFavoriteHotelIds } from "@/server/favorites";
import { LiteApiError, searchHotels } from "@/server/liteapi";
import type { HotelSummary } from "@/lib/hotels/types";
import type { LiteApiErrorKind } from "@/lib/liteapi-messages";
import type { SearchQuery } from "@/lib/search/params";
import { ResultsView } from "./results-view";
import { SearchError } from "./search-error";

type Loaded = { hotels: HotelSummary[]; favoriteIds: string[]; signedIn: boolean } | { error: LiteApiErrorKind };

async function load(query: SearchQuery): Promise<Loaded> {
  // An auth hiccup must not look like a pricing failure: fall back to signed-out.
  const userPromise = getCurrentUser().catch(() => null);
  try {
    const [hotels, user] = await Promise.all([searchHotels(query), userPromise]);
    const favoriteIds = user ? await getFavoriteHotelIds(hotels.map((h) => h.id)) : [];
    return { hotels, favoriteIds, signedIn: !!user };
  } catch (error) {
    // Only the kind crosses to the client — never the error object or its cause.
    return { error: error instanceof LiteApiError ? error.kind : "unknown" };
  }
}

/** Server: live prices for the search (~2–3 s), the user's hearts, then the client view. */
export async function Results({ query }: { query: SearchQuery }) {
  const data = await load(query);
  if ("error" in data) return <SearchError kind={data.error} />;
  // Keyed by who is looking: signing in/out re-renders with the same search key, and the
  // client-side heart state must start again from the server's favorites.
  return (
    <ResultsView
      key={`${data.signedIn}:${data.favoriteIds.join(",")}`}
      hotels={data.hotels}
      favoriteIds={data.favoriteIds}
      query={query}
      signedIn={data.signedIn}
    />
  );
}
