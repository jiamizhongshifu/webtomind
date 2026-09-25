import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PromptCaseAdminPage } from '../PromptCaseAdminPage';

const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/PromptCaseAdminPage.tsx'),
  'utf8'
);

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      email: 'admin@example.com'
    }
  })
}));

vi.mock('../../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('../../components/image-create/PromptCasesPanel', () => ({
  PromptCasesPanel: () => <div data-testid="prompt-cases-panel" />
}));

vi.mock('../../components/image-create/PromptCaseAssetCoveragePanel', () => ({
  PromptCaseAssetCoveragePanel: ({ className }: { className?: string }) => (
    <section
      className={className}
      data-testid="prompt-case-asset-coverage-panel"
    >
      <h2>案例素材覆盖助手</h2>
    </section>
  )
}));

vi.mock('../../components/image-create/AiUsageSummaryPanel', () => ({
  AiUsageSummaryPanel: ({ headingId }: { headingId?: string }) => (
    <section data-testid="ai-usage-panel">
      <h2 id={headingId}>AI 用量汇总</h2>
    </section>
  )
}));

function renderAdminPage() {
  return render(
    <MemoryRouter initialEntries={['/zh-CN/prompts/admin']}>
      <Routes>
        <Route path="/zh-CN/prompts/admin" element={<PromptCaseAdminPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PromptCaseAdminPage', () => {
  it('keeps the AI usage dialog on shared overlay behavior', () => {
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\buseOverlayBehavior\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui['"]/
    );
    expect(pageSource).toContain(
      'const usageModalRef = useOverlayBehavior<HTMLDivElement>'
    );
    expect(pageSource).toContain(
      'const assetCoverageModalRef = useOverlayBehavior<HTMLDivElement>'
    );
    expect(pageSource).toContain('ref={usageModalRef}');
    expect(pageSource).toContain('ref={assetCoverageModalRef}');
    expect(pageSource).toContain('tabIndex={-1}');
    expect(pageSource).not.toContain('document.body.style.overflow');
    expect(pageSource).not.toMatch(/event\.key === 'Escape'/);
  });

  it('keeps AI usage collapsed until the admin opens the dialog', () => {
    renderAdminPage();

    expect(screen.getByTestId('prompt-cases-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-usage-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AI 用量' }));

    expect(
      screen.getByRole('dialog', { name: 'AI 用量汇总' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('ai-usage-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭 AI 用量汇总' }));

    expect(screen.queryByTestId('ai-usage-panel')).not.toBeInTheDocument();
  });

  it('closes AI usage with the shared Escape handler', () => {
    renderAdminPage();

    fireEvent.click(screen.getByRole('button', { name: 'AI 用量' }));
    expect(screen.getByTestId('ai-usage-panel')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('ai-usage-panel')).not.toBeInTheDocument();
  });

  it('keeps the asset coverage assistant behind an admin dialog entry', () => {
    renderAdminPage();

    expect(screen.getByTestId('prompt-cases-panel')).toBeInTheDocument();
    expect(
      screen.queryByTestId('prompt-case-asset-coverage-panel')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '素材覆盖助手' }));

    expect(
      screen.getByRole('dialog', { name: '案例素材覆盖助手' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('prompt-case-asset-coverage-panel')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '关闭案例素材覆盖助手' })
    );

    expect(
      screen.queryByTestId('prompt-case-asset-coverage-panel')
    ).not.toBeInTheDocument();
  });

  it('closes asset coverage with the shared Escape handler', () => {
    renderAdminPage();

    fireEvent.click(screen.getByRole('button', { name: '素材覆盖助手' }));
    expect(
      screen.getByTestId('prompt-case-asset-coverage-panel')
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByTestId('prompt-case-asset-coverage-panel')
    ).not.toBeInTheDocument();
  });
});
