import { z } from "zod";

/*
 * Leniency policy: validate only the fields we use. Required = ids, prices and join keys
 * (a response without them is useless). Cosmetic fields fall back to null/[] via .catch(),
 * so one malformed photo never fails a whole hotel. Extra keys are dropped by z.object.
 */

const nullableString = z.string().nullish().catch(null);
/** Supplier media: https only, so a javascript:/data:/http: URL can never reach an <a> or the image proxy. */
const httpsUrl = z.url({ protocol: /^https$/ });
const nullableHttpsUrl = httpsUrl.nullish().catch(null);
const nullableNumber = z.number().nullish().catch(null);
const stringList = z.array(z.string()).catch([]);

const moneySchema = z.object({ amount: z.number(), currency: z.string() });
/** LiteAPI wraps many amounts in single-element arrays. */
const moneyList = z.array(moneySchema).catch([]);

// ---------- /data/hotels ----------
export const hotelListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  stars: nullableNumber,
  rating: nullableNumber,
  reviewCount: z.number().catch(0),
  address: nullableString,
  city: nullableString,
  main_photo: nullableHttpsUrl,
  thumbnail: nullableHttpsUrl,
  latitude: nullableNumber,
  longitude: nullableNumber,
});

// Top-level `data` stays strict: a changed upstream shape must be an error (not cached),
// never a silent "no hotels". Leniency applies per item and to cosmetic fields only.
export const hotelListSchema = z.object({
  data: z.array(hotelListItemSchema.nullable().catch(null)),
  // Quirk: an empty string instead of [] when nothing is found.
  hotelIds: z.union([z.array(z.string()), z.literal("")]).catch([]),
  total: z.number().catch(0),
});

// ---------- /hotels/min-rates ----------
export const minRatesSchema = z.object({
  data: z.array(
    z
      .object({
        hotelId: z.string(),
        price: z.number(),
        suggestedSellingPrice: nullableNumber,
        offerId: nullableString,
      })
      .nullable()
      .catch(null),
  ),
});

// ---------- /data/hotel ----------
const roomSchema = z.object({
  id: z.number(),
  roomName: z.string(),
  roomSizeSquare: nullableNumber,
  bedTypes: z
    .array(z.object({ quantity: z.number().catch(1), bedType: z.string() }).nullable().catch(null))
    .catch([]),
  photos: z.array(z.object({ url: httpsUrl, hd_url: nullableHttpsUrl }).nullable().catch(null)).catch([]),
});

export const hotelDetailsSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    hotelDescription: nullableString,
    hotelImportantInformation: nullableString,
    checkinCheckoutTimes: z
      .object({ checkin_start: nullableString, checkout: nullableString })
      .nullish()
      .catch(null),
    policyAttributes: z
      .object({
        checkIn: z.object({ from: nullableString }).nullish().catch(null),
        checkOut: z.object({ until: nullableString }).nullish().catch(null),
      })
      .nullish()
      .catch(null),
    hotelImages: z
      .array(z.object({ url: httpsUrl, urlHd: nullableHttpsUrl, caption: nullableString }).nullable().catch(null))
      .catch([]),
    main_photo: nullableHttpsUrl,
    city: nullableString,
    address: nullableString,
    starRating: nullableNumber,
    rating: nullableNumber,
    reviewCount: z.number().catch(0),
    location: z.object({ latitude: z.number(), longitude: z.number() }).nullish().catch(null),
    hotelFacilities: stringList,
    rooms: z.array(roomSchema.nullable().catch(null)).catch([]),
    sentiment_analysis: z.object({ pros: stringList, cons: stringList }).nullish().catch(null),
  }),
});

// ---------- /data/reviews ----------
export const reviewsSchema = z.object({
  data: z
    .array(
      z
        .object({
          reviewId: z.union([z.number(), z.string()]),
          averageScore: nullableNumber,
          country: nullableString,
          type: nullableString,
          name: z.string().catch("Гість"),
          date: nullableString,
          headline: nullableString,
          language: nullableString,
          pros: nullableString,
          cons: nullableString,
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  total: z.number().catch(0),
});

// ---------- /hotels/rates ----------
export const rateSchema = z.object({
  name: z.string().catch(""),
  // Missing board must not turn into a "room only" claim.
  boardType: z.string().min(1).nullish().catch(null),
  boardName: nullableString,
  mappedRoomId: nullableNumber,
  retailRate: z.object({
    total: moneyList,
    suggestedSellingPrice: moneyList,
    // Per-item leniency: one bad fee must not hide the tourism fee the guest pays at the hotel.
    taxesAndFees: z
      .array(
        z
          .object({ included: z.boolean(), description: z.string().catch(""), amount: z.number(), currency: z.string() })
          .nullable()
          .catch(null),
      )
      .nullish()
      .catch([]),
  }),
  cancellationPolicies: z
    .object({
      refundableTag: z.string().catch("NRFN"),
      // A malformed entry becomes null (not dropped): the mapper then refuses to promise free cancellation.
      cancelPolicyInfos: z
        .array(
          z
            .object({
              cancelTime: z.string(),
              amount: z.number(),
              currency: z.string(),
              type: z.string().nullish().catch(null),
              timezone: nullableString,
            })
            .nullable()
            .catch(null),
        )
        .nullish(),
    })
    .nullish()
    .catch(null),
});

export const ratesSchema = z.object({
  data: z.array(
      z.object({
        hotelId: z.string(),
        roomTypes: z.array(
          z.object({
            offerId: z.string().min(1),
            rates: z.array(rateSchema).min(1),
            offerRetailRate: moneySchema,
            suggestedSellingPrice: moneySchema.nullish().catch(null),
          }),
        ),
      }),
    ),
});

// ---------- booking host (verified against sandbox fixtures in stage 5) ----------
export const prebookSchema = z.object({
  data: z.object({
    prebookId: z.string().min(1),
    offerId: z.string().nullish(),
    hotelId: z.string().min(1),
    currency: z.string(),
    price: z.number(),
    suggestedSellingPrice: nullableNumber,
    priceDifferencePercent: nullableNumber,
    cancellationChanged: z.boolean().nullish().catch(null),
    boardChanged: z.boolean().nullish().catch(null),
    checkin: z.iso.date(),
    checkout: z.iso.date(),
    roomTypes: z.array(
      z.object({
        rates: z.array(
          rateSchema.extend({
            adultCount: z.number().int().catch(0),
            occupancyNumber: z.number().int().catch(1),
          }),
        ),
      }),
    ),
  }),
});

const bookingDataSchema = z.object({
  bookingId: z.string().min(1),
  clientReference: nullableString,
  status: z.string(),
  hotelConfirmationCode: nullableString,
  prebookId: nullableString,
  hotelId: nullableString,
  hotel: z.object({ hotelId: z.string(), name: z.string() }).nullish().catch(null),
  checkin: z.iso.date(),
  checkout: z.iso.date(),
  adults: nullableNumber,
  price: nullableNumber,
  currency: nullableString,
  // Quirk: bookedRooms[].rate.boardType/boardName are swapped in sandbox; use bookedRooms[].boardType.
  bookedRooms: z
    .array(
      z
        .object({
          roomType: z.object({ name: z.string().catch("") }).nullish().catch(null),
          boardType: nullableString,
          boardName: nullableString,
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  cancellationPolicies: rateSchema.shape.cancellationPolicies,
  lastFreeCancellationDate: nullableString,
});

export const bookingSchema = z.object({ data: bookingDataSchema });
export const bookingListSchema = z.object({ data: z.array(bookingDataSchema) });

export const cancelBookingSchema = z.object({
  data: z.object({
    bookingId: z.string(),
    // Docs show both spellings.
    status: z.enum(["CANCELLED", "CANCELED", "CANCELLED_WITH_CHARGES", "CANCELED_WITH_CHARGES"]),
    cancellation_fee: nullableNumber,
    refund_amount: nullableNumber,
    currency: nullableString,
  }),
});

export type PrebookResponse = z.infer<typeof prebookSchema>;
export type BookingResponse = z.infer<typeof bookingSchema>;
export type CancelBookingResponse = z.infer<typeof cancelBookingSchema>;
export type BookingData = z.infer<typeof bookingDataSchema>;
export type HotelListResponse = z.infer<typeof hotelListSchema>;
export type MinRatesResponse = z.infer<typeof minRatesSchema>;
export type HotelDetailsResponse = z.infer<typeof hotelDetailsSchema>;
export type ReviewsResponse = z.infer<typeof reviewsSchema>;
export type RatesResponse = z.infer<typeof ratesSchema>;
export type RateResponse = z.infer<typeof rateSchema>;
