import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../HomePage';

const testState = vi.hoisted(() => ({
  getPublicPromptCases: vi.fn(),
  subscribeMarketingEmail: vi.fn()
}));

vi.mock('../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null
  })
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCases: testState.getPublicPromptCases,
  subscribeMarketingEmail: testState.subscribeMarketingEmail
}));

vi.mock('react-i18next', () => {
  const translations: Record<string, string> = {
    'newsletter.label': '案例周报',
    'newsletter.title': '每周收到热门图片案例和可复制 Prompt',
    'newsletter.description':
      '留下邮箱，我们会把新上架的高质量案例、热门 prompt 和可复现工作流定期发给你。',
    'newsletter.emailLabel': '邮箱地址',
    'newsletter.placeholder': 'you@example.com',
    'newsletter.submit': '订阅案例周报',
    'newsletter.submitting': '提交中',
    'newsletter.success': '已订阅。下一期热门案例会发送到你的邮箱。',
    'newsletter.duplicate': '这个邮箱已经订阅过了。下一期周报会继续发送给你。',
    'newsletter.invalid': '请输入有效的邮箱地址。',
    'newsletter.error': '订阅失败，请稍后再试。',
    'newsletter.privacy': '只发送 WebToMind 热门案例与产品更新，可随时退订。',
    'hotCases.label': '精选案例',
    'hotCases.title': '直接浏览我们的精选图片 Prompt',
    'hotCases.description':
      '这里展示 WebToMind 人工筛选的高质量案例。每张图都可以打开查看 prompt、模型和生成思路，再进入工作台继续复用。',
    'hotCases.viewAll': '查看全部案例',
    'hotCases.cardCta': '查看 Prompt',
    'caseCollections.ariaLabel': '更多精选案例合集',
    'caseCollections.viewCategory': '查看分类',
    'caseCollections.portrait.label': '人像写真',
    'caseCollections.portrait.title': '人像写真案例',
    'caseCollections.portrait.description': '适合角色海报和头像。',
    'caseCollections.commerce.label': '商品视觉',
    'caseCollections.commerce.title': '商品视觉案例',
    'caseCollections.commerce.description': '适合商品 KV。',
    'caseCollections.character.label': '角色设定',
    'caseCollections.character.title': '角色设定案例',
    'caseCollections.character.description': '适合角色卡。',
    'caseCollections.poster.label': '海报设计',
    'caseCollections.poster.title': '海报设计案例',
    'caseCollections.poster.description': '适合海报。',
    'caseCollections.workflow.label': '工作流 / 复用',
    'caseCollections.workflow.title': '工作流案例',
    'caseCollections.workflow.description': '适合复用。',
    'cta.title': '让 AI 出图变得可控可复现',
    'cta.description': '免费注册，立即体验视觉提示词工作台',
    'hero.title': '看图选择，生成可复现提示词',
    'hero.description': 'WebToMind 专注 AI 图片创作。',
    'hero.primaryCta': '浏览可复用图片 Prompt',
    'hero.secondaryCta': '进入工作台',
    'hero.badge': 'PROMPT / IMAGE / REMIX',
    'stats.activeUsers': '活跃用户',
    'stats.generatedImages': '生成图片',
    'stats.rating': '用户评分'
  };

  return {
    useTranslation: () => ({
      t: (key: string, options?: { returnObjects?: boolean }) => {
        if (key === 'faq.items' && options?.returnObjects) {
          return [
            {
              q: 'WebToMind 现在主要解决什么问题？',
              a: '把参考图和 prompt 组织成可复用工作流。'
            }
          ];
        }
        return translations[key] || key;
      },
      i18n: { language: 'zh-CN', changeLanguage: vi.fn() }
    })
  };
});

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={['/zh-CN/overview']}>
      <Routes>
        <Route path="/zh-CN/overview" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage newsletter and featured cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.getPublicPromptCases.mockResolvedValue([
      {
        id: 'case-without-title',
        title: '',
        prompt:
          '这是一段非常长的 prompt，不应该被裁切后作为首页精选案例标题展示，因为这会让卡片信息层级失控。',
        imageUrl: 'https://cdn.example.com/case.png',
        category: 'portrait',
        model: 'GPT Image 2',
        generateCount: 12,
        locale: 'zh-CN'
      }
    ]);
    testState.subscribeMarketingEmail.mockResolvedValue({
      ok: true,
      status: 'subscribed'
    });
  });

  it('validates email locally before submitting', async () => {
    renderHomePage();

    const emailInput = await screen.findByLabelText(/邮箱地址/);
    fireEvent.change(emailInput, {
      target: { value: 'not-an-email' }
    });
    fireEvent.click(screen.getByRole('button', { name: '订阅案例周报' }));

    expect(testState.subscribeMarketingEmail).not.toHaveBeenCalled();
    expect(
      await screen.findByText('请输入有效的邮箱地址。')
    ).toBeInTheDocument();
  });

  it('shows validation feedback for an empty newsletter email', async () => {
    renderHomePage();

    const emailInput = await screen.findByLabelText(/邮箱地址/);
    fireEvent.click(screen.getByRole('button', { name: '订阅案例周报' }));

    expect(testState.subscribeMarketingEmail).not.toHaveBeenCalled();
    expect(
      await screen.findByText('请输入有效的邮箱地址。')
    ).toBeInTheDocument();
    expect(emailInput).toHaveAttribute(
      'aria-describedby',
      'home-newsletter-status'
    );
  });

  it('shows duplicate subscription state without treating it as an error', async () => {
    testState.subscribeMarketingEmail.mockResolvedValueOnce({
      ok: true,
      status: 'already_subscribed'
    });
    renderHomePage();

    const emailInput = await screen.findByLabelText(/邮箱地址/);
    fireEvent.change(emailInput, {
      target: { value: 'creator@example.com' }
    });
    fireEvent.click(screen.getByRole('button', { name: '订阅案例周报' }));

    expect(
      await screen.findByText(
        '这个邮箱已经订阅过了。下一期周报会继续发送给你。'
      )
    ).toBeInTheDocument();
    expect(testState.subscribeMarketingEmail).toHaveBeenCalledWith({
      email: 'creator@example.com',
      locale: 'zh-CN',
      source: 'home_hot_cases'
    });
  });

  it('does not fallback featured case titles to long prompts', async () => {
    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText('精选案例 1')).toBeInTheDocument();
    });
    expect(screen.queryByText(/这是一段非常长的 prompt/)).toBeNull();
  });
});
