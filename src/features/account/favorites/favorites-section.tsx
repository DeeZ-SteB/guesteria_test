import Link from "next/link";
import { connection } from "next/server";
import { listOwnFavorites, type SavedHotel } from "@/server/favorites";
import { ErrorState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { FavoritesView } from "./favorites-view";

export async function FavoritesSection() {
  await connection();
  let hotels: SavedHotel[];
  try {
    hotels = await listOwnFavorites();
  } catch {
    return (
      <ErrorState
        title="Не вдалося завантажити обране"
        text="Спробуйте ще раз за хвилину."
        action={
          <Link href="/account?tab=favorites" className={buttonClasses()}>
            Спробувати ще
          </Link>
        }
      />
    );
  }
  return <FavoritesView hotels={hotels} />;
}
