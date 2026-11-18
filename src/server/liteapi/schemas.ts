import { z } from "zod";

/*
 * Leniency policy: validate only the fields we use. Required = ids, prices and join keys
 * (a response without them is useless). Cosmetic fields fall back to null/[] via .catch(),
 * so one malformed photo never fails a whole hotel. Extra keys are dropped by z.object.
 */

const nullableString = z.string().nullish().catch(null);
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
  main_photo: nullableString,
  thumbnail: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
});

export const hotelListSchema = z.object({
  data: z.array(hotelListItemSchema.nullable().catch(null)).catch([]),
  // Quirk: an empty string instead of [] when nothing is found.
  hotelIds: z.union([z.array(z.string()), z.literal("")]).catch([]),
  total: z.number().catch(0),
});

// ---------- /hotels/min-rates ----------
export const minRatesSchema = z.object({
  data: z
    .array(
      z.object({
        hotelId: z.string(),
        price: z.number(),
        suggestedSellingPrice: nullableNumber,
        offerId: nullableString,
      }),
    )
    .catch([]),
});

// ---------- /data/hotel ----------
const roomSchema = z.object({
  id: z.number(),
  roomName: z.string(),
  roomSizeSquare: nullableNumber,
  bedTypes: z
    .array(z.object({ quantity: z.number().catch(1), bedType: z.string() }).nullable().catch(null))
    .catch([]),
  photos: z.array(z.object({ url: z.string(), hd_url: nullableString }).nullable().catch(null)).catch([]),
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
      .array(z.object({ url: z.string(), urlHd: nullableString, caption: nullableString }).nullable().catch(null))
      .catch([]),
    main_photo: nullableString,
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
const rateSchema = z.object({
  name: z.string().catch(""),
  boardType: z.string().catch("RO"),
  boardName: nullableString,
  mappedRoomId: nullableNumber,
  retailRate: z.object({
    total: moneyList,
    suggestedSellingPrice: moneyList,
    taxesAndFees: z
      .array(z.object({ included: z.boolean(), description: z.string().catch(""), amount: z.number(), currency: z.string() }))
      .nullish()
      .catch([]),
  }),
  cancellationPolicies: z
    .object({
      refundableTag: z.string().catch("NRFN"),
      cancelPolicyInfos: z
        .array(z.object({ cancelTime: z.string(), amount: z.number(), currency: z.string(), timezone: nullableString }))
        .nullish()
        .catch([]),
    })
    .nullish()
    .catch(null),
});

export const ratesSchema = z.object({
  data: z
    .array(
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
    )
    .catch([]),
});

// ---------- booking host (untested against sandbox until stage 5) ----------
export const prebookSchema = z.object({
  data: z.object({
    prebookId: z.string(),
    offerId: z.string().nullish(),
    hotelId: z.string().nullish(),
    currency: z.string(),
    price: z.number(),
    suggestedSellingPrice: nullableNumber,
    priceDifferencePercent: nullableNumber,
    cancellationChanged: z.boolean().nullish().catch(null),
    boardChanged: z.boolean().nullish().catch(null),
  }),
});

export const bookingSchema = z.object({
  data: z.object({
    bookingId: z.string(),
    clientReference: nullableString,
    status: z.string(),
    hotelConfirmationCode: nullableString,
    price: nullableNumber,
    currency: nullableString,
    checkin: nullableString,
    checkout: nullableString,
  }),
});

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

export type HotelListResponse = z.infer<typeof hotelListSchema>;
export type MinRatesResponse = z.infer<typeof minRatesSchema>;
export type HotelDetailsResponse = z.infer<typeof hotelDetailsSchema>;
export type ReviewsResponse = z.infer<typeof reviewsSchema>;
export type RatesResponse = z.infer<typeof ratesSchema>;
export type RateResponse = z.infer<typeof rateSchema>;
