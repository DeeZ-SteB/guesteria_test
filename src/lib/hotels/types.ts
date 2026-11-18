import type { Money } from "@/lib/money";

/** Domain types produced by the LiteAPI mappers. UI and the AI assistant never see raw LiteAPI shapes. */

export type HotelSummary = {
  id: string;
  name: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  address: string | null;
  photo: string | null;
  location: { lat: number; lng: number } | null;
  /** Public price for the whole stay (suggested selling price, never below it). */
  price: Money;
  // Our net cost is deliberately absent: these objects reach client components and the AI.
  // Booking (stage 5) gets the payable price from prebook instead.
};

export type HotelImage = { url: string; hdUrl: string | null; caption: string | null };

export type Room = {
  id: number;
  name: string;
  sizeSqm: number | null;
  beds: string[];
  photos: string[];
};

export type HotelDetails = {
  id: string;
  name: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  address: string | null;
  city: string | null;
  location: { lat: number; lng: number } | null;
  images: HotelImage[];
  descriptionParagraphs: string[];
  importantInfo: string[];
  /** "14:00" style, Kyiv-agnostic local hotel time. */
  checkIn: string | null;
  checkOut: string | null;
  facilities: string[];
  rooms: Room[];
  pros: string[];
  cons: string[];
};

export type PayAtHotel = { label: string; amount: Money };

export type RateOption = {
  offerId: string;
  boardCode: string | null;
  boardLabel: string;
  /**
   * true + deadline → free until then; true + null → no penalty at all;
   * false → non-refundable or the supplier's policy could not be read safely.
   */
  refundable: boolean;
  /** ISO UTC. */
  freeCancellationUntil: string | null;
  /** Penalty after the deadline, when it is a fixed amount. */
  penalty: Money | null;
  price: Money;
  payAtHotel: PayAtHotel[];
};

export type RoomOffer = {
  /** Static room info from hotel details, when LiteAPI mapped the rate to a room. */
  room: Room | null;
  name: string;
  rates: RateOption[];
};

export type Review = {
  id: string;
  score: number | null;
  name: string;
  country: string | null;
  type: string | null;
  date: string | null;
  headline: string | null;
  /** BCP-47-ish code from the supplier, e.g. "pl", "en-gb". */
  language: string | null;
  pros: string | null;
  cons: string | null;
};
