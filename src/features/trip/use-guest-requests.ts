"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { applyRequestEvent, type GuestRequestView } from "@/lib/booking/trip-page";
import { GUEST_REQUEST_COLUMNS, guestRequestRowSchema } from "./schemas";

export type LiveState = "connecting" | "live" | "offline";

/**
 * Guest requests with live statuses. The first list comes from the server; Realtime (RLS-checked
 * with the user's JWT) pushes changes; every (re)subscribe and every return to the tab refetches,
 * so nothing is missed between render and subscribe or during a disconnect.
 */
export function useGuestRequests(bookingId: string, initial: GuestRequestView[], live: boolean) {
  const [requests, setRequests] = useState(initial);
  const [connection, setConnection] = useState<LiveState>(live ? "connecting" : "offline");

  const merge = useCallback((row: unknown) => {
    const parsed = guestRequestRowSchema.safeParse(row);
    if (parsed.success) setRequests((list) => applyRequestEvent(list, parsed.data));
  }, []);

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const refetch = async () => {
      const { data, error } = await supabase
        .from("guest_requests")
        .select(GUEST_REQUEST_COLUMNS)
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && !disposed) data.forEach(merge);
    };

    void (async () => {
      // Join with the user's token, never as anon (RLS decides which rows reach us).
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel = supabase
        .channel(`trip-requests:${bookingId}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "guest_requests", filter: `booking_id=eq.${bookingId}` }, (payload) =>
          merge(payload.new),
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            void refetch();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnection("offline");
          }
        });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [bookingId, live, merge]);

  const add = useCallback((row: GuestRequestView) => setRequests((list) => applyRequestEvent(list, row)), []);
  return { requests, add, connection };
}
