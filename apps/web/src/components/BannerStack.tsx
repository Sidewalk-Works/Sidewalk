"use client";

import React from "react";
import { useToastContext } from "./ToastProvider";
import { PersistentBanner } from "./PersistentBanner";

interface BannerStackProps {
  position?: "top" | "bottom";
  maxVisible?: number;
}

const BANNER_STACK_Z_INDEX = 900;

export function BannerStack({ position = "top", maxVisible = 3 }: BannerStackProps) {
  const { banners, dismissBanner } = useToastContext();

  const visibleBanners = banners.slice(0, maxVisible);
  const overflowCount = Math.max(0, banners.length - visibleBanners.length);

  if (visibleBanners.length === 0) return null;

  return (
    <div
      aria-label="System banners"
      style={{
        position: "fixed",
        [position]: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: "640px",
        zIndex: BANNER_STACK_Z_INDEX,
        padding: "0 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {visibleBanners.map((banner) => (
        <div key={banner.bannerId} style={{ pointerEvents: "auto" }}>
          <PersistentBanner
            id={banner.bannerId}
            level={banner.level}
            heading={banner.heading}
            body={banner.body}
            actionText={banner.actionText}
            actionUrl={banner.actionUrl}
            dismissable={banner.dismissable}
            onDismiss={dismissBanner}
          />
        </div>
      ))}
      {overflowCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            pointerEvents: "auto",
            alignSelf: "center",
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: "9999px",
            padding: "4px 10px",
            fontSize: "12px",
          }}
        >
          +{overflowCount} more {overflowCount === 1 ? "banner" : "banners"}
        </div>
      )}
    </div>
  );
}
