import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MentionBadge } from '../MentionBadge';

describe('MentionBadge', () => {
  it('renders count', () => {
    render(<MentionBadge count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides when count is 0', () => {
    const { container } = render(<MentionBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows 99+ for counts above 99', () => {
    render(<MentionBadge count={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders the @ symbol', () => {
    render(<MentionBadge count={3} />);
    expect(screen.getByText('@')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<MentionBadge count={2} onClick={onClick} />);
    fireEvent.click(screen.getByText('@'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies direct mention styling when hasDirectMentions', () => {
    render(<MentionBadge count={1} hasDirectMentions />);
    const badge = screen.getByText('1');
    expect(badge).toHaveStyle({ background: '#7c3aed' });
  });

  it('applies default styling when no direct mentions', () => {
    render(<MentionBadge count={1} hasDirectMentions={false} />);
    const badge = screen.getByText('1');
    expect(badge).toHaveStyle({ background: '#3b82f6' });
  });
});
