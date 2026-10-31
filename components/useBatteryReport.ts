"use client";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function useBatteryReport(
  sessionId: Id<"sessions"> | null | undefined,
  ended: boolean,
) {
  const reportDevice = useMutation(api.web.device);
  // Battery Status API (Chrome/Android; not Safari): sent with the session, never invented.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (t: string, f: () => void) => void;
        removeEventListener: (t: string, f: () => void) => void;
      }>;
    };
    if (!sessionId || ended || !nav.getBattery) return;
    let battery: Awaited<
      ReturnType<NonNullable<typeof nav.getBattery>>
    > | null = null;
    const send = () =>
      battery &&
      void reportDevice({
        sessionId,
        batteryLevel: battery.level,
        charging: battery.charging,
      }).catch(() => {});
    void nav.getBattery().then((b) => {
      battery = b;
      send();
      b.addEventListener("levelchange", send);
      b.addEventListener("chargingchange", send);
    });
    const t = setInterval(send, 60000);
    return () => {
      clearInterval(t);
      battery?.removeEventListener("levelchange", send);
      battery?.removeEventListener("chargingchange", send);
    };
  }, [sessionId, ended, reportDevice]);
}
