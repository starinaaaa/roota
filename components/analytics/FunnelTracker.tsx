"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { funnelPagePattern, campaignValue } from "@/lib/analytics/values";

export default function FunnelTracker() {
  const pathname = usePathname();
  const previous = useRef("");
  useEffect(() => {
    if (previous.current === pathname || !funnelPagePattern.test(pathname))
      return;
    previous.current = pathname;
    const params = new URLSearchParams(window.location.search);
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        page: pathname,
        source: campaignValue(params.get("utm_source")),
        medium: campaignValue(params.get("utm_medium")),
        campaign: campaignValue(params.get("utm_campaign")),
      }),
    }).catch(() => {});
  }, [pathname]);
  return null;
}
