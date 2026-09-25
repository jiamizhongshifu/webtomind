import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GenerationRecordsRailHarnessPage } from '../GenerationRecordsRailHarnessPage';

describe('GenerationRecordsRailHarnessPage', () => {
  it('renders the isolated generation records rail and wires actions', () => {
    render(<GenerationRecordsRailHarnessPage />);

    expect(screen.getByText('Generation Records Rail')).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', {
        name: /historyRail\.title|Generation records/i
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed task' }));

    expect(
      screen.getByTestId('generation-records-rail-state')
    ).toHaveTextContent('retry:failed');
  });
});
