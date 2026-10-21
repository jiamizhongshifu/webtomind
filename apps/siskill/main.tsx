import { MemberPlanButton } from './membership';
import React, { useEffect, useState, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  useLocation,
  useNavigate
} from 'react-router-dom';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '../../src/design/shared-tokens.css';
import '../../src/design/web-tokens.css';
import '../../src/design/ui-primitives.css';
import '../../src/design/app-shell.css';
import '../../src/web/styles/geist-theme.css';
import '../../src/web/styles/marketing-pages.css';
import '../../src/web/styles/top-nav.css';
import '../../src/web/styles/skill-catalog.css';
import './site.css';
import { Button, ButtonLink } from '../../src/shared/ui';
import { SkillBrandHero } from '../../src/web/pages/skill-catalog/SkillBrandHero';
import {
  SkillCard,
  agentLabel,
  outputLabel
} from '../../src/web/pages/skill-catalog/skillCatalogShared';
import { SkillPreviewGallery } from '../../src/web/pages/skill-catalog/SkillPreviewGallery';
import {
  skillShowcases as sharedSkillShowcases,
  type SkillShowcase
} from '../../src/web/pages/skill-catalog/skillShowcases';
import localShowcases from './showcases.json';
import { applySeo } from '../../src/web/lib/seo';
import {
  pickLocalized,
  type SkillCatalogItem
} from '../../src/services/skill-catalog-api';
import products from './catalog.json';
import { SkillPurchaseLink } from './purchase';
import { FreeSkillDownload } from './free-download';
import freeReleases from './free-releases.json';
const Account = lazy(() => import('./account'));
const skillShowcases: Record<string, SkillShowcase> = {
  ...sharedSkillShowcases,
  ...localShowcases
};


const catalog = products as (SkillCatalogItem & {
  availability: string;
  formats: string[];
})[];
const origin = 'https://siskill.dev';
const contact = 'mailto:support@webtomind.com?subject=SiSkill';
function Site() {
  const location = useLocation();
  const navigate = useNavigate();
  const zh = location.pathname.startsWith('/zh-CN');
  const locale = zh ? 'zh-CN' : 'en-US';
  const rawPath = location.pathname
    .replace(/^\/(en-US|zh-CN)(?=\/|$)/, '')
    .replace(/\/$/, '');
  const path = rawPath || '/overview';
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState({
    slugs: [] as string[],
    membershipOpen: false
  });
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/siskill/products', { cache: 'no-store' }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch('/api/siskill/plans', { cache: 'no-store' }).then((r) =>
        r.ok ? r.json() : null
      )
    ])
      .then(([p, m]) => {
        if (active)
          setSales({
            slugs: p?.checkoutOpen
              ? p.products.map(
                  (v: { siskill_releases: { slug: string } }) =>
                    v.siskill_releases.slug
                )
              : [],
            membershipOpen: Boolean(m?.membershipOpen && m.plans.length)
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const t = (en: string, cn: string) => (zh ? cn : en);
  const detailSlug =
    path.startsWith('/skills/') && path !== '/skills/pricing'
      ? path.split('/')[2]
      : '';
  const skill = catalog.find((s) => s.slug === detailSlug);
  const freeRelease = freeReleases.find((r) => r.slug === detailSlug);
  const paidAvailable = sales.slugs.includes(detailSlug);
  const params = new URLSearchParams(location.search);
  const filtered = catalog.filter(
    (s) =>
      (!params.get('tier') || s.tier === params.get('tier')) &&
      (!params.get('type') || s.outputTypes.includes(params.get('type')!)) &&
      (!params.get('q') ||
        JSON.stringify([s.name, s.summary])
          .toLowerCase()
          .includes(params.get('q')!.toLowerCase()))
  );
  const isHome = path === '/overview';
  const known =
    isHome ||
    path === '/account' ||
    path === '/skills' ||
    path === '/skills/pricing' ||
    Boolean(skill);
  useEffect(() => {
    if (!/^\/(en-US|zh-CN)\//.test(location.pathname)) {
      const explicit = /^\/zh-CN(?:\/|$)/.test(location.pathname);
      const preferred = explicit ? 'zh-CN' : 'en-US';
      navigate(`/${preferred}${path}${location.search}${location.hash}`, {
        replace: true
      });
    }
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  useEffect(
    () =>
      applySeo({
        title:
          path === '/account'
            ? 'Your library | SiSkill'
            : skill
              ? `${pickLocalized(skill.name, locale)} | SiSkill`
              : path === '/skills/pricing'
                ? 'SiSkill — Membership & pricing'
                : path === '/skills'
                  ? 'SiSkill — Explore creative Skills'
                  : 'SiSkill — Your agent. A creative studio.',
        description: skill
          ? pickLocalized(skill.summary, locale)
          : t(
              'Reusable Skills for visuals, decks, websites and video. Explore real demonstrations and editable outputs.',
              '为图文、演示、网页和视频打造的可复用 Skill。先看真实演示，再了解可编辑的交付成果。'
            ),
        canonical: `${origin}/${locale}${path}`,
        htmlLang: locale,
        robots:
          known && path !== '/account' ? 'index,follow' : 'noindex,follow',
        ogImage: `${origin}${skill ? skillShowcases[skill.slug].poster : '/skill-previews/og-image.png'}`,
        alternates: [
          { hreflang: 'en-US', href: `${origin}/en-US${path}` },
          { hreflang: 'zh-CN', href: `${origin}/zh-CN${path}` },
          { hreflang: 'x-default', href: `${origin}/en-US${path}` }
        ]
      }),
    [locale, path, known, skill]
  );
  const navLinks = (
    <>
      <Link to={`/${locale}/skills`}>{t('Explore Skills', '发现 Skill')}</Link>
      <Link to={`/${locale}/skills?tier=free`}>
        {t('Free Skills', '免费 Skill')}
      </Link>
      <Link to={`/${locale}/skills/pricing`}>{t('Pricing', '会员与价格')}</Link>
      <Link to={`/${locale}/account`}>{t('My Skills', '我的 Skill')}</Link>
    </>
  );
  const grid = (items: typeof catalog) => (
    <div className="skill-grid">
      {items.map((s) => (
        <SkillCard
          key={s.slug}
          skill={s}
          locale={locale}
          isZh={zh}
          availabilityLabel={
            freeReleases.some((r) => r.slug === s.slug)
              ? t('Download free Skill →', '免费下载 Skill →')
              : sales.slugs.includes(s.slug)
                ? t('Buy Skill →', '购买 Skill →')
                : t('Coming soon · See demo →', '即将开放 · 查看演示 →')
          }
        />
      ))}
    </div>
  );
  const shelf = (paid: boolean) => (
    <section className="skill-shelf">
      <div className="skill-section-head">
        <div>
          <h2>
            {paid
              ? t('Built for your next big idea', '值得带走的工作流')
              : t('Free Skills', '免费 Skill')}
          </h2>
          <p>
            {paid
              ? t(
                  'Explore reviewed workflows. Purchase available Skills or preview what is coming next.',
                  '探索已审核的工作流，购买已开放的 Skill，或预览后续内容。'
                )
              : t(
                  'Explore real outputs. Open Graph Image is ready to download free.',
                  '探索真实产出，Open Graph Image 已开放免费下载。'
                )}
          </p>
        </div>
        <ButtonLink
          variant="ghost"
          to={`/${locale}/skills?tier=${paid ? 'premium' : 'free'}`}
        >
          {t('View all', '查看全部')}
        </ButtonLink>
      </div>
      {grid(
        catalog
          .filter((s) => s.tier === (paid ? 'premium' : 'free'))
          .slice(0, 4)
      )}
    </section>
  );
  return (
    <div className="marketing-page-root skill-catalog-root siskill-root">
      <header className="home-nav">
        <div className="nav-container">
          <Link
            className="nav-logo"
            to={`/${locale}/overview`}
            aria-label="SiSkill home"
          >
            <img src="/favicon.svg" width="36" height="36" alt="" />
            <span className="nav-logo-text">SiSkill</span>
          </Link>
          <nav
            className="siskill-desktop-nav"
            aria-label={t('Main navigation', '主导航')}
          >
            {navLinks}
          </nav>
          <div className="nav-actions">
            <Link
              className="siskill-language"
              aria-label={t('Switch to Chinese', '切换为英文')}
              to={`${location.pathname.replace(/^\/(en-US|zh-CN)/, zh ? '/en-US' : '/zh-CN')}${location.search}${location.hash}`}
            >
              {zh ? 'EN' : '中文'}
            </Link>
            <ButtonLink
              className="siskill-nav-cta"
              variant="primary"
              to={`/${locale}/skills`}
            >
              {t('Browse Skills', '浏览 Skill')}
            </ButtonLink>
            <button
              className="siskill-menu-button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label={t('Open navigation menu', '打开导航菜单')}
            >
              ☰
            </button>
          </div>
        </div>
        {menu && (
          <nav
            className="siskill-mobile-nav"
            aria-label={t('Mobile navigation', '移动导航')}
          >
            {navLinks}
          </nav>
        )}
      </header>
      <main
        className={`marketing-page-main ${isHome ? 'skill-home' : skill ? 'skill-detail' : 'siskill-page'}`}
      >
        {path === '/account' ? (
          <Suspense
            fallback={
              <p role="status">{t('Loading your account…', '正在加载账号…')}</p>
            }
          >
            <Account locale={locale} />
          </Suspense>
        ) : isHome ? (
          <>
            <SkillBrandHero
              locale={locale}
              isZh={zh}
              brandName="SiSkill"
              freeSkillsComingSoon
            />
            <section className="skill-discovery-heading">
              <h2>{t('What will you make next?', '今天，你想做点什么？')}</h2>
              <form
                className="skill-hero-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(
                    `/${locale}/skills?q=${encodeURIComponent(search.trim())}`
                  );
                }}
              >
                <input
                  aria-label={t('Search creative tasks', '搜索创作任务')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t(
                    'Find a workflow for your idea',
                    '搜索你要完成的任务'
                  )}
                />
                <Button type="submit" variant="primary">
                  {t('Search', '搜索')} →
                </Button>
              </form>
            </section>
            <nav
              className="skill-task-nav"
              aria-label={t('Discover by deliverable', '按交付任务发现')}
            >
              {['image', 'slides', 'web', 'video'].map((type, i) => (
                <Link key={type} to={`/${locale}/skills?type=${type}`}>
                  <span>0{i + 1}</span>
                  <strong>{outputLabel(type, zh)}</strong>
                  <span>↗</span>
                </Link>
              ))}
            </nav>
            {shelf(true)}
            {shelf(false)}
            <section className="skill-steps">
              <h2>
                {t(
                  'From a brief to a finished project',
                  '从想法到可编辑的作品'
                )}
              </h2>
              <ol>
                {[
                  [
                    t('See the output', '先看成品'),
                    t(
                      'Watch the demonstration. Review inputs, requirements and output formats.',
                      '观看演示，了解输入、依赖和交付格式。'
                    )
                  ],
                  [
                    t('Choose your workflow', '选择工作流'),
                    t(
                      'Find a Skill that fits the job. Free and paid packages are being prepared.',
                      '找到适合任务的 Skill。免费与付费安装包正在准备中。'
                    )
                  ],
                  [
                    t('Make it yours', '做成自己的作品'),
                    t(
                      'When packages launch, run them in your agent with your material and edit the result.',
                      '安装包开放后，在你的 Agent 中运行，使用自己的资料修改并导出作品。'
                    )
                  ]
                ].map(([title, body], i) => (
                  <li key={title}>
                    <span className="skill-step-index">0{i + 1}</span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </li>
                ))}
              </ol>
            </section>
            <Pricing zh={zh} locale={locale} open={sales.membershipOpen} />
            <section className="skill-faq">
              <h2>FAQ</h2>
              {[
                [
                  t('What is a Skill?', '什么是 Skill？'),
                  t(
                    'A reusable workflow for an AI agent: instructions, templates and scripts that produce a specific deliverable.',
                    'Skill 是 Agent 可复用的工作流，由说明、模板和脚本组成，帮助完成具体交付任务。'
                  )
                ],
                [
                  t('Can I buy or install now?', '现在可以购买或安装吗？'),
                  t(
                    'Open Graph Image is free after sign-in. Customer Case Study Deck and NotebookLM Video are available when their purchase buttons are active, or through Pro. Other demos remain previews until their packages are released.',
                    'Open Graph Image 登录后免费。客户案例 Deck 和 NotebookLM 视频生成可在购买按钮开放时单独购买，或通过 Pro 获取。其他演示在安装包发布前仍属预览。'
                  )
                ],
                [
                  t(
                    'Is SiSkill part of my WebToMind membership?',
                    'SiSkill 包含在 WebToMind 会员中吗？'
                  ),
                  t(
                    'SiSkill is a separate product. Its purchases and memberships are separate from WebToMind credits and memberships.',
                    'SiSkill 是独立产品，购买和会员权益与 WebToMind 的会员、积分分别计算。'
                  )
                ],
                [
                  t('Are model costs included?', '包含模型费用吗？'),
                  t(
                    'No. Agent subscriptions, model usage and external services are separate. Each Skill lists its requirements.',
                    'Agent 订阅、模型用量与第三方服务费用另计，具体依赖列在每个 Skill 详情中。'
                  )
                ]
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </section>
          </>
        ) : path === '/skills' ? (
          <>
            <header className="skill-hero">
              <h1>{t('Find your next Skill', '找到你的下一个 Skill')}</h1>
              <p>
                {t(
                  'See what it makes. Find the workflow for your next project.',
                  '先看作品，再为下一个项目挑选工作流。'
                )}
              </p>
            </header>
            <form
              className="skill-hero-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new URLSearchParams(location.search);
                values.set('q', search);
                navigate(`?${values}`);
              }}
            >
              <input
                aria-label={t('Search Skills', '搜索 Skill')}
                placeholder={
                  params.get('q') || t('Search Skills', '搜索 Skill')
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" variant="primary">
                {t('Search', '搜索')}
              </Button>
            </form>
            <div className="siskill-filters">
              {['', 'free', 'premium'].map((tier) => (
                <Link
                  key={tier}
                  aria-current={
                    (params.get('tier') || '') === tier ? 'page' : undefined
                  }
                  to={`?${new URLSearchParams({ ...Object.fromEntries(params), tier })}`}
                >
                  {tier === 'free'
                    ? t('Free', '免费')
                    : tier === 'premium'
                      ? t('Paid', '付费')
                      : t('All Skills', '全部')}
                </Link>
              ))}
              {['', 'image', 'slides', 'web', 'video'].map((type) => (
                <Link
                  key={type}
                  aria-current={
                    (params.get('type') || '') === type ? 'page' : undefined
                  }
                  to={`?${new URLSearchParams({ ...Object.fromEntries(params), type })}`}
                >
                  {type ? outputLabel(type, zh) : t('All formats', '全部格式')}
                </Link>
              ))}
            </div>
            <p className="skill-muted">
              {t(
                'Explore the collection. Open Graph Image is free; available paid Skills show a purchase link.',
                '探索作品与演示。Open Graph Image 登录后免费，已开放的付费 Skill 将显示购买入口。'
              )}
            </p>
            {filtered.length ? (
              grid(filtered)
            ) : (
              <div className="skill-empty">
                <h2>{t('No matching workflows', '没有匹配的工作流')}</h2>
                <Link to={`/${locale}/skills`}>
                  {t('Clear filters', '清除筛选')}
                </Link>
              </div>
            )}
          </>
        ) : path === '/skills/pricing' ? (
          <>
            <header className="skill-hero">
              <h1>{t('SiSkill pricing', 'SiSkill 会员与价格')}</h1>
              <p>
                {t(
                  'One workflow, or a library for your creative practice.',
                  '买一个工作流，或为创作准备一整个技能库。'
                )}
              </p>
            </header>
            <Pricing zh={zh} locale={locale} open={sales.membershipOpen} />
          </>
        ) : skill ? (
          <>
            <nav className="skill-breadcrumb">
              <Link to={`/${locale}/skills`}>{t('Skills', 'Skill 目录')}</Link>{' '}
              / {pickLocalized(skill.name, locale)}
            </nav>
            <div className="skill-product-layout">
              <div className="skill-product-media">
                <SkillPreviewGallery
                  key={skill.slug}
                  locale={locale}
                  isZh={zh}
                  examples={[
                    {
                      mediaType: 'video',
                      mediaUrl: skillShowcases[skill.slug].video,
                      posterUrl: skillShowcases[skill.slug].poster,
                      title: {
                        'en-US': 'Workflow demonstration',
                        'zh-CN': '工作流功能演示'
                      },
                      description: {
                        'en-US':
                          'Original demonstration. English, 16:9, no narration.',
                        'zh-CN': '原创功能演示，英文、16:9、无口播。'
                      }
                    },
                    ...skillShowcases[skill.slug].examples
                  ]}
                />
                <div className="skill-runtime-facts">
                  <h2>{t('Runs in your agent', '在你的 Agent 中使用')}</h2>
                  <div className="skill-agent-list">
                    {skill.compatibleAgents.map((a) => (
                      <span key={a}>{agentLabel(a)}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="skill-product-info">
                <header className="skill-detail-header">
                  <p className="skill-muted">
                    {freeRelease
                      ? t(
                          'Free workflow · Available now',
                          '免费工作流 · 现已开放'
                        )
                      : paidAvailable
                        ? t(
                            'Paid workflow · Available now',
                            '付费工作流 · 现已开放'
                          )
                        : skill.tier === 'free'
                          ? t(
                              'Free workflow · Coming soon',
                              '免费工作流 · 即将开放'
                            )
                          : t(
                              'Paid workflow · Coming soon',
                              '付费工作流 · 即将开放'
                            )}
                  </p>
                  <h1>{pickLocalized(skill.name, locale)}</h1>
                  <p className="skill-detail-summary">
                    {pickLocalized(skill.summary, locale)}
                  </p>
                </header>
                <div className="skill-upgrade">
                  <h2>{t('Get this workflow', '获取工作流')}</h2>
                  {!freeRelease && (
                    <p>
                      {t(
                        paidAvailable
                          ? 'Purchase once for this Skill and its updates, or join Pro for access during your paid membership.'
                          : 'This workflow is a preview. Its package is not available yet.',
                        paidAvailable
                          ? '单次购买获得此 Skill 及更新，或开通 Pro 在有效期内访问。'
                          : '此工作流仍为预览，安装包尚未开放。'
                      )}
                    </p>
                  )}
                  {freeRelease ? (
                    <FreeSkillDownload
                      key={skill.slug}
                      slug={skill.slug}
                      locale={locale}
                    />
                  ) : (
                    <SkillPurchaseLink slug={skill.slug} locale={locale} />
                  )}
                  <p>
                    <Link to={`/${locale}/skills/pricing`}>
                      {t('Compare membership plans', '查看会员方案')}
                    </Link>
                  </p>
                </div>
              </div>
            </div>
            <div className="skill-product-sections">
              {(['outputs', 'inputs', 'dependencies'] as const).map(
                (key, i) => (
                  <section key={key}>
                    <h2>
                      {
                        [
                          t('What you get', '交付内容'),
                          t('What you provide', '需要的输入'),
                          t('What you need', '运行依赖')
                        ][i]
                      }
                    </h2>
                    <ul>
                      {(freeRelease && key === 'dependencies'
                        ? [
                            {
                              'en-US':
                                'Node.js 18+; verified here with Node 24 on macOS.',
                              'zh-CN':
                                'Node.js 18+，本次使用 macOS 与 Node 24 验证。'
                            },
                            {
                              'en-US':
                                'Playwright and Chromium / Chrome, installed separately. Dependency setup requires internet; rendering then runs offline.',
                              'zh-CN':
                                '需单独安装 Playwright 与 Chromium / Chrome；依赖安装需要联网，渲染可离线运行。'
                            }
                          ]
                        : skillShowcases[skill.slug][key]
                      ).map((v) => (
                        <li key={v['en-US']}>{pickLocalized(v, locale)}</li>
                      ))}
                    </ul>
                  </section>
                )
              )}
              <section>
                <h2>{t('Usage notes', '使用说明')}</h2>
                <p>
                  {pickLocalized(skillShowcases[skill.slug].limits, locale)}
                </p>
              </section>
            </div>
            <section>
              <h2>{t('More to make', '更多创作可能')}</h2>
              {grid(catalog.filter((s) => s.slug !== skill.slug).slice(0, 4))}
            </section>
          </>
        ) : (
          <section className="skill-empty">
            <h1>{t('Page not found', '页面不存在')}</h1>
            <Link to={`/${locale}/overview`}>
              {t('Back to SiSkill', '返回 SiSkill')}
            </Link>
          </section>
        )}
      </main>
      <footer className="marketing-footer siskill-footer">
        <Link className="nav-logo" to={`/${locale}/overview`}>
          <img src="/favicon.svg" width="32" height="32" alt="" />
          SiSkill
        </Link>
        <nav>
          {navLinks}
          <a href={contact}>{t('Contact', '联系我们')}</a>
        </nav>
        <p>
          {t(
            'An independent home for creative Skills.',
            '创作 Skill 的独立产品。'
          )}
        </p>
        <small>
          © {new Date().getFullYear()} SiSkill ·{' '}
          <a
            href={`https://webtomind.com/${locale}/overview?utm_source=siskill&utm_medium=referral&utm_campaign=product-family`}
          >
            WebToMind ↗
          </a>
        </small>
      </footer>
    </div>
  );
}
function Pricing({
  zh,
  locale,
  open
}: {
  zh: boolean;
  locale: string;
  open: boolean;
}) {
  const [yearly, setYearly] = useState(true);
  const t = (en: string, cn: string) => (zh ? cn : en);
  return (
    <section className="skill-pricing">
      <div className="skill-section-head">
        <h2>
          {t(
            'One workflow, or the whole studio library',
            '一个工作流，或自营全库'
          )}
        </h2>
        <div
          className="skill-pill-group"
          role="group"
          aria-label={t('Billing cycle', '计费周期')}
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              className="skill-pill"
              aria-pressed={value === yearly}
              onClick={() => setYearly(value)}
            >
              {value ? t('Yearly', '年付') : t('Monthly', '月付')}
            </button>
          ))}
        </div>
      </div>
      <p className="skill-muted">
        {t(
          open
            ? 'Pro currently includes 2 published Skills: Customer Case Study Deck and NotebookLM Video. Other demos are not included until released. Model and third-party costs are separate.'
            : 'Membership checkout is temporarily unavailable. Open Graph Image remains free after sign-in.',
          open
            ? 'Pro 目前包含 2 个已发布 Skill：客户案例 Deck、NotebookLM 视频生成。其他演示在正式发布前不包含在内。模型和第三方服务费用另计。'
            : '会员结账暂未开放，Open Graph Image 仍可登录后免费下载。'
        )}
      </p>
      <div className="skill-pricing-grid">
        {[
          {
            name: t('Free', '免费'),
            price: '$0',
            unit: '',
            items: [
              t('Free creative workflows', '免费创作工作流'),
              t('Editable outputs', '可编辑交付'),
              t('No credit card', '无需信用卡')
            ]
          },
          {
            name: 'SiSkill Pro',
            price: yearly ? '$79' : '$9.99',
            unit: yearly ? t('/year', '/年') : t('/month', '/月'),
            items: [
              t(
                'All studio Pro Skills during your paid period',
                '有效期内的全部自营 Pro Skill'
              ),
              t(
                'Published additions and updates included',
                '包含后续正式发布的自营内容与更新'
              ),
              t(
                'Renews automatically; cancel renewal in your account',
                '自动续费，可在账户内取消续费'
              ),
              t(
                'Separate from WebToMind membership and credits',
                '独立于 WebToMind 会员与积分'
              )
            ]
          },
          {
            name: t('Individual Skills', '单独购买'),
            price: '$9.99',
            unit: t('per published Skill', '每个已发布 Skill'),
            items: [
              t('One workflow, one payment', '一个工作流，一次付款'),
              t('Keep acquired versions locally', '已获得版本可持续本地使用'),
              t(
                'Create commercial outputs; no package resale',
                '可创作商业成品，禁止转售原包'
              )
            ]
          }
        ].map((plan, i) => (
          <article
            key={plan.name}
            className={`skill-plan ${i === 1 ? 'skill-plan--highlight' : ''}`}
          >
            <h3>{plan.name}</h3>
            <p className="skill-plan-price">
              {plan.price}
              <span>{plan.unit}</span>
            </p>
            <ul>
              {plan.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {i === 1 ? (
              <MemberPlanButton yearly={yearly} locale={locale} />
            ) : (
              <ButtonLink
                variant="secondary"
                to={`/${locale}/skills?tier=${i === 0 ? 'free' : 'premium'}`}
              >
                {t('Explore workflows', '探索工作流')}
              </ButtonLink>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Site />
    </BrowserRouter>
  </React.StrictMode>
);
