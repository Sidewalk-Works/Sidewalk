import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnreadNotificationBadgeIcon } from '../UnreadNotificationBadgeIcon';

describe('UnreadNotificationBadgeIcon', () => {
  it('renders badge with count', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={5} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides badge when count is 0', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={0} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows 99+ for counts greater than 99', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders many state for large counts', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={75} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('uses urgentCount precedence when urgent notifications exist', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={10} urgentCount={2} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('uses hasUrgent as urgent signal with unread fallback', () => {
    render(<UnreadNotificationBadgeIcon unreadCount={3} hasUrgent />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onClick when activated by mouse', () => {
    const onClick = vi.fn();
    render(<UnreadNotificationBadgeIcon unreadCount={1} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when activated by keyboard', () => {
    const onClick = vi.fn();
    render(<UnreadNotificationBadgeIcon unreadCount={1} onClick={onClick} />);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
