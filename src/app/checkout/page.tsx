import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutContent } from "@/features/checkout/checkout-content";
import { CheckoutChecking } from "@/features/checkout/checkout-checking";

export const metadata: Metadata = { title: "Оформлення", robots: { index: false, follow: false } };

// prebook (≤110 s) and book (≤95 s) + reference lookup (≤20 s) must fit; also covers this page's actions.
export const maxDuration = 120;

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <Suspense fallback={<CheckoutChecking />}>
      <CheckoutContent searchParams={searchParams} />
    </Suspense>
  );
}
