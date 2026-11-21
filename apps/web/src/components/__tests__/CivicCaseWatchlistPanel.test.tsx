import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CivicCaseWatchlistPanel } from '../CivicCaseWatchlistPanel';

describe('CivicCaseWatchlistPanel', () => {
  it('renders stale status without crashing', () => {
    render(
      <CivicCaseWatchlistPanel
        items={[
          {
            caseId: 'case-stale-1',
            title: 'Old pothole report',
            category: 'pothole',
            neighborhood: 'Downtown',
            followUpStatus: 'stale',
            addedAtIso: '2026-01-02T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Old pothole report')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('collects a real case id before adding', () => {
    const onAddItem = vi.fn();
    render(<CivicCaseWatchlistPanel items={[]} onAddItem={onAddItem} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Case' }));
    fireEvent.change(screen.getByLabelText('Case ID'), { target: { value: 'case-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddItem).toHaveBeenCalledWith('case-123');
  });
});
