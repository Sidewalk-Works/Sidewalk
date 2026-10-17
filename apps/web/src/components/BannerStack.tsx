"use client";

import React from 'react';
import { useToastContext } from './ToastProvider';
import { PersistentBanner } from './PersistentBanner';

interface BannerStackProps {
  position?: 'top' | 'bottom';
  maxVisible?: number;
}

export function BannerStack({ position = 'top', maxVisible = 3 }: BannerStackProps) {
  const { banners, dismissBanner } = useToastContext();

  const visibleBanners = banners.slice(0, maxVisible);

  if (visibleBanners.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Banners"
      role="status"
      style={{
        position: 'fixed',
        [position]: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '640px',
        zIndex: 9000,
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {visibleBanners.map((banner) => (
        <PersistentBanner
          key={banner.bannerId}
          id={banner.bannerId}
          level={banner.level}
          heading={banner.heading}
          body={banner.body}
          actionText={banner.actionText}
          actionUrl={banner.actionUrl}
          dismissable={true}
          onDismiss={dismissBanner}
        />
      ))}
    </div>
  );
}
