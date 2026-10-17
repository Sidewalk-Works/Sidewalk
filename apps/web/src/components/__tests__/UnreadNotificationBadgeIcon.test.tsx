import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnreadNotificationBadgeIcon } from '../UnreadNotificationBadgeIcon';

describe('UnreadNotificationBadgeIcon', () => {
  it('renders badge with count', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides badge when count is 0', () => {
    const { container } = render(<UnreadNotificationBadgeIcon unreadCount={0} />);
    const badge = container.querySelector('span[style*="position: absolute"]');
    expect(badge).toBeNull();
  });

  it('shows 99+ for counts greater than 99', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders the bell icon', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={1} />);
    expect(screen.getByText('🔔')).toBeInTheDocument();
  });

  it('applies urgent styling when hasUrgent is true', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={3} hasUrgent />);
    const badge = screen.getByText('3');
    expect(badge).toHaveStyle({ background: '#ef4444' });
  });

  it('applies normal styling when hasUrgent is false', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={3} hasUrgent={false} />);
    const badge = screen.getByText('3');
    expect(badge).toHaveStyle({ background: '#2563eb' });
  });
});
