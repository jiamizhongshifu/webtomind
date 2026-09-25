import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReferenceCharacterPanelsHarnessPage } from '../ReferenceCharacterPanelsHarnessPage';

describe('ReferenceCharacterPanelsHarnessPage', () => {
  it('renders the isolated reference and character panel preview', () => {
    render(<ReferenceCharacterPanelsHarnessPage />);

    expect(screen.getByText('参考图')).toBeInTheDocument();
    expect(screen.getByText('角色一致性')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上传' }));

    expect(screen.getByTestId('reference-character-state')).toHaveTextContent(
      '"loginRequests": 1'
    );
  });
});
