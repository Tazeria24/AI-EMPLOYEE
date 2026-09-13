"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps an open conversation fresh.
 *
 * Prefers Supabase Realtime (the messages table is added to the
 * supabase_realtime publication in migration 0006). Realtime can be
 * unavailable — not enabled on the project, a dropped socket, or Supabase env
 * missing locally — so a slow poll runs alongside it as a fallback. Both paths
 * just ask the server component to re-render; message data still comes through
 * RLS-scoped queries.
 */
export function LiveRefresh({
  conversationId,
  pollMs = 15000,
}: {
  conversationId: string;
  pollMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), pollMs);

    let cleanupRealtime: (() => void) | undefined;
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`conversation:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => router.refresh(),
        )
        .subscribe();

      cleanupRealtime = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // No Supabase config, or realtime unavailable — polling still covers it.
    }

    return () => {
      clearInterval(interval);
      cleanupRealtime?.();
    };
  }, [conversationId, pollMs, router]);

  return null;
}
