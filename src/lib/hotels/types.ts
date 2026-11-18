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
  /** What LiteAPI charges us. Server-side only concern; kept for booking. */
  netPrice: Money;
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
  boardCode: string;
  boardLabel: string;
  refundable: boolean;
  /** ISO UTC; null when non-refundable or the deadline is unknown. */
  freeCancellationUntil: string | null;
  /** Penalty after the deadline, when known. */
  penalty: Money | null;
  price: Money;
  netPrice: Money;
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
  pros: string | null;
  cons: string | null;
};
