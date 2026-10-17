import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MentionNotificationToast } from '../MentionNotificationToast';

const mockPayload = {
  notificationId: 'notif-1',
  author: { userId: 'user-1', username: 'johndoe', role: 'citizen' as const },
  caseId: 'case-123',
  commentId: 'comment-456',
  snippet: 'Hey @alice, can you take a look at this?',
  mentions: [
    { mentionedUsername: 'alice', startIndex: 4, endIndex: 10 },
  ],
  notifiedAtIso: '2026-07-20T10:00:00.000Z',
};

describe('MentionNotificationToast', () => {
  it('renders author username', () => {
    render(<MentionNotificationToast payload={mockPayload} />);
    expect(screen.getByText('johndoe')).toBeInTheDocument();
  });

  it('renders snippet', () => {
    render(<MentionNotificationToast payload={mockPayload} />);
    expect(screen.getByText(/Hey @alice/)).toBeInTheDocument();
  });

  it('renders View Comment button', () => {
    render(<MentionNotificationToast payload={mockPayload} />);
    expect(screen.getByText('View Comment')).toBeInTheDocument();
  });

  it('calls onView when View Comment is clicked', () => {
    const onView = vi.fn();
    render(<MentionNotificationToast payload={mockPayload} onView={onView} />);
    fireEvent.click(screen.getByText('View Comment'));
    expect(onView).toHaveBeenCalledWith('case-123', 'comment-456');
  });

  it('shows expand button when multiple mentions', () => {
    const multiMentionPayload = {
      ...mockPayload,
      mentions: [
        { mentionedUsername: 'alice', startIndex: 4, endIndex: 10 },
        { mentionedUsername: 'bob', startIndex: 15, endIndex: 19 },
      ],
    };
    render(<MentionNotificationToast payload={multiMentionPayload} />);
    expect(screen.getByText('Show 2 mentions')).toBeInTheDocument();
  });

  it('highlights self mentions', () => {
    render(
      <MentionNotificationToast
        payload={mockPayload}
        currentUserId="alice"
      />,
    );
    expect(screen.getByText('You were directly mentioned')).toBeInTheDocument();
  });
});
