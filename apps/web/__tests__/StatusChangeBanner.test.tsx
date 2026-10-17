import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusChangeBanner } from '../StatusChangeBanner';

const mockAlert = {
  bannerId: 'banner-1',
  isDismissible: true,
  content: 'A report was updated',
  actionUrl: '/cases/case-123',
};

describe('StatusChangeBanner', () => {
  it('renders the alert content', () => {
    render(<StatusChangeBanner alert={mockAlert} />);
    expect(screen.getByText('A report was updated')).toBeInTheDocument();
  });

  it('renders transition when provided', () => {
    render(
      <StatusChangeBanner
        alert={mockAlert}
        transition={{ from: 'open', to: 'resolved' }}
      />,
    );
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('resolved')).toBeInTheDocument();
  });

  it('renders actor name when provided', () => {
    render(
      <StatusChangeBanner alert={mockAlert} actorName="Jane Doe" />,
    );
    expect(screen.getByText('by Jane Doe')).toBeInTheDocument();
  });

  it('dismisses when clicking close button', () => {
    render(<StatusChangeBanner alert={mockAlert} />);
    const closeBtn = screen.getByText('x');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('A report was updated')).not.toBeInTheDocument();
  });

  it('renders view details link when actionUrl is present', () => {
    render(<StatusChangeBanner alert={mockAlert} />);
    const link = screen.getByText('View Details');
    expect(link).toHaveAttribute('href', '/cases/case-123');
  });
});
