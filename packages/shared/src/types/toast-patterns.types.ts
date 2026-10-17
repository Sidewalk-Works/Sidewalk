export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export type BannerPriority = 'persistent' | 'dismissable' | 'auto-dismiss';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  action?: { label: string; href: string };
  duration?: number;
}

export interface StatusBanner {
  id: string;
  priority: BannerPriority;
  message: string;
  type: 'info' | 'warning' | 'error';
  dismissable: boolean;
  expiresAt?: Date;
}
