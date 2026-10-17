import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersistentBanner } from '../PersistentBanner';

describe('PersistentBanner', () => {
  it('renders heading and body', () => {
    render(
      <PersistentBanner
        id="b1"
        level="info"
        heading="System Update"
        body="Scheduled maintenance tonight"
      />,
    );
    expect(screen.getByText('System Update')).toBeInTheDocument();
    expect(screen.getByText('Scheduled maintenance tonight')).toBeInTheDocument();
  });

  it('renders action button with text', () => {
    render(
      <PersistentBanner
        id="b1"
        level="warning"
        heading="Warning"
        body="Something happened"
        actionText="Learn More"
      />,
    );
    expect(screen.getByText('Learn More')).toBeInTheDocument();
  });

  it('renders action as link when actionUrl is provided', () => {
    render(
      <PersistentBanner
        id="b1"
        level="info"
        heading="Title"
        body="Body"
        actionText="Go"
        actionUrl="/settings"
      />,
    );
    const link = screen.getByText('Go');
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('dismisses when clicking close', () => {
    const onDismiss = vi.fn();
    render(
      <PersistentBanner
        id="b1"
        level="error"
        heading="Error"
        body="Something went wrong"
        dismissable
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('x'));
    expect(onDismiss).toHaveBeenCalledWith('b1');
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('does not render close button when not dismissable', () => {
    render(
      <PersistentBanner
        id="b1"
        level="info"
        heading="Info"
        body="Content"
        dismissable={false}
      />,
    );
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });
});
