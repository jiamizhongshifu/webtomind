import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PromptLibraryShellNav } from '../PromptLibraryShellNav';

describe('PromptLibraryShellNav', () => {
  it('keeps the prompt library active on shared prompt detail routes', () => {
    render(
      <MemoryRouter
        initialEntries={['/zh-CN/prompts/commercial-prompt-case-b8ce3bd1']}
      >
        <PromptLibraryShellNav locale="zh-CN" isZh />
      </MemoryRouter>
    );

    const promptLibraryLinks = screen.getAllByRole('link', {
      name: '提示词库'
    });
    expect(promptLibraryLinks).toHaveLength(2);
    promptLibraryLinks.forEach((link) => {
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveAttribute('href', '/zh-CN/prompts');
    });
  });
});
