"use client";

import { LocateFixed } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Narrows the list to reports around the visitor. The browser asks permission; nothing is stored. */
export function NearMeButton({ active }: { active: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "locating" | "denied">("idle");

  const go = (near: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (near) {
      next.set("near", near);
      next.set("radiusKm", next.get("radiusKm") ?? "5");
    } else {
      next.delete("near");
      next.delete("radiusKm");
    }
    router.push(`/issues?${next}`);
  };

  if (active) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(null)}
        icon={<LocateFixed className="size-4" aria-hidden />}
      >
        Clear “near me”
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={state === "locating"}
        icon={<LocateFixed className="size-4" aria-hidden />}
        onClick={() => {
          if (!navigator.geolocation) return setState("denied");
          setState("locating");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setState("idle");
              go(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`);
            },
            () => setState("denied"),
            { timeout: 10_000, maximumAge: 60_000 }
          );
        }}
      >
        Reports near me
      </Button>
      {state === "denied" && (
        <span role="alert" className="text-[0.8125rem] text-danger">
          We could not get your location. Use the map view and zoom to your area instead.
        </span>
      )}
    </span>
  );
}
