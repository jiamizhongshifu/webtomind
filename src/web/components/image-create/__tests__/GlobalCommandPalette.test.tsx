import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GlobalCommandPalette } from '../GlobalCommandPalette';

describe('GlobalCommandPalette', () => {
  it('loads the palette on ⌘K / Ctrl+K and closes it with Escape', async () => {
    const { container } = render(
      <MemoryRouter>
        <button type="button">Open commands</button>
        <GlobalCommandPalette localePrefix="/zh-CN" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('dialog', { name: '命令面板' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Open commands' });
    trigger.focus();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(
      await screen.findByPlaceholderText('搜索页面、工具与快捷动作…')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '命令面板' })
    ).toBeInTheDocument();
    expect(screen.getByText('提示词库')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    const input = screen.getByRole('combobox');
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() =>
      expect(
        container.querySelector('.global-command-palette')
      ).toHaveAttribute('data-open', 'false')
    );
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });
});
