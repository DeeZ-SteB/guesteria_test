import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Сторінку не знайдено"
      text="Можливо, посилання застаріло або сторінку перенесли."
      action={
        <Link href="/" className={buttonClasses()}>
          На головну
        </Link>
      }
      className="py-24"
    />
  );
}
