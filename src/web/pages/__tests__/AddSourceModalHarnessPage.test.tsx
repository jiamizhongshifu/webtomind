import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AddSourceModalHarnessPage } from '../AddSourceModalHarnessPage';

describe('AddSourceModalHarnessPage', () => {
  it('renders the source modal and navigates to the URL subview', () => {
    render(<AddSourceModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '添加来源' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '网站' }));

    expect(
      screen.getByRole('dialog', { name: '网站和 YouTube 网址' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('网址')).toBeInTheDocument();
  });
});
