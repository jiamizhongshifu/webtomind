import { RelatedSkills } from './skill-catalog/RelatedSkills';
import { SkillPreviewGallery } from './skill-catalog/SkillPreviewGallery';
import { skillShowcases, isVideoExample } from './skill-catalog/skillShowcases';
import { SkillPurchaseCard } from './skill-catalog/SkillPurchaseCard';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, ButtonLink } from '@/shared/ui';
import {
  SkillCatalogRequestError,
  getSkillCatalogDetail,
  pickLocalized,
  type SkillDetail
} from '@/services/skill-catalog-api';
import { applySeo } from '../lib/seo';
import { TopNav } from '../components/TopNav';
import { MarketingFooter } from '../components/MarketingFooter';
import { useMarketingLocale } from '../lib/marketing-locale';
import {
  agentLabel,
  formatInstalls,
  outputLabel
} from './skill-catalog/skillCatalogShared';
import '../styles/marketing-pages.css';
import '../styles/skill-catalog.css';

function installCommand(slug: string, agent: string): string {
  // The CLI installs into Claude Code unless told otherwise.
  const base = `npx webtomind-cli install ${slug}`;
  const cliAgent = agent === 'gemini-cli' ? 'gemini' : agent;
  return cliAgent === 'claude-code' ? base : `${base} --agent ${cliAgent}`;
}

function CopyButton({ text, isZh }: { text: string; isZh: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制' : 'Copy'}
    </Button>
  );
}

export function SkillDetailPage() {
  const { id = '' } = useParams();
  const { locale, isZh } = useMarketingLocale();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; skill: SkillDetail }
    | { status: 'not_found' }
    | { status: 'error' }
  >({ status: 'loading' });
  const [agent, setAgent] = useState('claude-code');
  const [reloadKey, setReloadKey] = useState(0);
  const installPanel = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSkillCatalogDetail(id, controller.signal)
      .then((skill) => {
        setState({ status: 'ready', skill });
        setAgent(
          skill.compatibleAgents.includes('claude-code')
            ? 'claude-code'
            : skill.compatibleAgents[0] || 'claude-code'
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setState(
          error instanceof SkillCatalogRequestError && error.status === 404
            ? { status: 'not_found' }
            : { status: 'error' }
        );
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  const skill = state.status === 'ready' ? state.skill : null;
  const name = skill ? pickLocalized(skill.name, locale) || skill.slug : '';
  const showcase = skill ? skillShowcases[skill.slug] : undefined;
  const examples = skill
    ? [
        ...(showcase
          ? [
              {
                mediaType: 'video',
                mediaUrl: showcase.video,
                posterUrl: showcase.poster,
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
              ...showcase.examples
            ]
          : []),
        ...skill.examples
      ].filter(
        (item, index, all) =>
          all.findIndex((other) => other.mediaUrl === item.mediaUrl) === index
      )
    : [];

  useEffect(() => {
    if (state.status !== 'not_found') return;
    return applySeo({
      title: isZh ? 'Skill 不存在 | WebToMind' : 'Skill not found | WebToMind',
      robots: 'noindex,follow'
    });
  }, [isZh, state.status]);

  useEffect(() => {
    if (!skill) return;
    const path = `/skills/${skill.slug}`;
    const firstImage = skill.examples.find(
      (example) => !isVideoExample(example)
    );
    return applySeo({
      title: `${name} · Agent Skill | WebToMind`,
      description: pickLocalized(skill.summary, locale),
      robots: 'index,follow',
      canonical: `${window.location.origin}/${locale}${path}`,
      ogImage:
        showcase?.poster ||
        firstImage?.mediaUrl ||
        firstImage?.posterUrl ||
        undefined,
      alternates: [
        { hreflang: 'zh-CN', href: `${window.location.origin}/zh-CN${path}` },
        { hreflang: 'en-US', href: `${window.location.origin}/en-US${path}` },
        {
          hreflang: 'x-default',
          href: `${window.location.origin}/en-US${path}`
        }
      ]
    });
  }, [locale, name, skill, showcase]);

  return (
    <div className="marketing-page-root skill-catalog-root">
      <TopNav />
      <main className="marketing-page-main skill-detail">
        <nav
          className="skill-breadcrumb"
          aria-label={isZh ? '面包屑' : 'Breadcrumb'}
        >
          <Link to={`/${locale}/skills`}>{isZh ? 'Skill 目录' : 'Skills'}</Link>
          {skill ? <span aria-current="page">{name}</span> : null}
        </nav>

        {state.status === 'loading' ? (
          <div className="skill-detail-loading" aria-busy="true">
            <span className="skill-skeleton-line" />
            <span className="skill-skeleton-line skill-skeleton-line--short" />
          </div>
        ) : state.status === 'not_found' ? (
          <div className="skill-empty">
            <h1>
              {isZh
                ? '这个 Skill 不存在或已下架'
                : 'This Skill does not exist or was removed'}
            </h1>
            <ButtonLink to={`/${locale}/skills`} variant="primary">
              {isZh ? '浏览全部 Skill' : 'Browse all Skills'}
            </ButtonLink>
          </div>
        ) : state.status === 'error' || !skill ? (
          <div className="skill-empty">
            <h1>{isZh ? 'Skill 暂时无法加载' : 'This Skill could not load'}</h1>
            <Button
              variant="secondary"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {isZh ? '重试' : 'Try again'}
            </Button>
          </div>
        ) : (
          <>
            <div className="skill-product-layout">
              <div className="skill-product-media">
                <SkillPreviewGallery
                  key={skill.slug}
                  examples={examples}
                  locale={locale}
                  isZh={isZh}
                />
                <div className="skill-runtime-facts">
                  <h2>{isZh ? '在你的 Agent 中使用' : 'Runs in your agent'}</h2>
                  <div className="skill-agent-list">
                    {skill.compatibleAgents.map((value) => (
                      <span key={value}>{agentLabel(value)}</span>
                    ))}
                  </div>
                  <p className="skill-muted">
                    {isZh
                      ? '安装在本地运行，模型或第三方服务费用另计。'
                      : 'Install and run locally. Agent, model and third-party costs are separate.'}
                  </p>
                </div>
              </div>
              <div className="skill-product-info">
                <header className="skill-detail-header">
                  <div className="skill-detail-badges">
                    <Badge
                      variant={skill.tier === 'free' ? 'success' : 'accent'}
                    >
                      {skill.tier === 'free'
                        ? isZh
                          ? '免费'
                          : 'Free'
                        : isZh
                          ? '付费'
                          : 'Paid'}
                    </Badge>
                    {skill.outputTypes.map((type) => (
                      <Badge key={type}>{outputLabel(type, isZh)}</Badge>
                    ))}
                  </div>
                  <h1>{name}</h1>
                  <p className="skill-detail-summary">
                    {pickLocalized(skill.summary, locale)}
                  </p>
                  <p className="skill-detail-meta">
                    {skill.installCount > 0
                      ? formatInstalls(skill.installCount, isZh)
                      : isZh
                        ? 'WebToMind 工作流'
                        : 'A WebToMind workflow'}
                    {skill.latestVersion ? ` · v${skill.latestVersion}` : ''}
                  </p>
                  {skill.languages.length ? (
                    <p className="skill-muted">
                      {isZh
                        ? '商品支持的输出语言：'
                        : 'Supported output languages: '}
                      {skill.languages
                        .map((language) =>
                          language === 'zh-CN'
                            ? isZh
                              ? '简体中文'
                              : 'Simplified Chinese'
                            : language === 'en-US' || language === 'en'
                              ? isZh
                                ? '英语'
                                : 'English'
                              : language
                        )
                        .join(' · ')}
                    </p>
                  ) : null}
                </header>

                {skill.tier === 'premium' ? (
                  <SkillPurchaseCard
                    key={skill.slug}
                    slug={skill.slug}
                    locale={locale}
                    isZh={isZh}
                  />
                ) : (
                  <div className="skill-free-offer">
                    <strong>{isZh ? '免费使用' : 'Free to use'}</strong>
                    <p>
                      {isZh
                        ? '登录后安装，无须信用卡。'
                        : 'Sign in to install. No card required.'}
                    </p>
                    <a
                      href="#skill-install"
                      onClick={() => {
                        if (installPanel.current)
                          installPanel.current.open = true;
                      }}
                    >
                      {isZh ? '查看安装说明' : 'Get this Skill'} →
                    </a>
                  </div>
                )}
                {pickLocalized(skill.description, locale) !==
                pickLocalized(skill.summary, locale) ? (
                  <p className="skill-product-description">
                    {pickLocalized(skill.description, locale)}
                  </p>
                ) : null}
                <details
                  ref={installPanel}
                  className="skill-install-details"
                  id="skill-install"
                >
                  <summary>
                    {isZh ? '安装与连接说明' : 'Install & connect'}
                  </summary>
                  <aside
                    className="skill-install-panel"
                    aria-label={isZh ? '安装' : 'Install'}
                  >
                    <h2>
                      {isZh ? '安装到你的 Agent' : 'Install into your agent'}
                    </h2>
                    <div
                      className="skill-agent-tabs"
                      role="group"
                      aria-label={isZh ? '选择 Agent' : 'Choose agent'}
                    >
                      {(skill.compatibleAgents.length
                        ? skill.compatibleAgents
                        : ['claude-code']
                      ).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="skill-pill"
                          aria-pressed={agent === value}
                          onClick={() => setAgent(value)}
                        >
                          {agentLabel(value)}
                        </button>
                      ))}
                    </div>
                    <div className="skill-command">
                      <code>{installCommand(skill.slug, agent)}</code>
                      <CopyButton
                        text={installCommand(skill.slug, agent)}
                        isZh={isZh}
                      />
                    </div>
                    <p className="skill-muted">
                      {isZh
                        ? '首次使用会打开浏览器让你登录授权，不需要 API Key。需要 Node.js 22 或更高版本。'
                        : 'The first run opens your browser to sign in and approve. No API key needed. Requires Node.js 22+.'}
                    </p>
                  </aside>
                </details>
              </div>
            </div>
            <div className="skill-product-sections">
              <section>
                <h2>{isZh ? '你会得到什么' : 'What you get'}</h2>
                {showcase ? (
                  <ul>
                    {showcase.outputs.map((line, index) => (
                      <li key={index}>{pickLocalized(line, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{pickLocalized(skill.description, locale)}</p>
                )}
              </section>
              <section>
                <h2>{isZh ? '适用场景与边界' : 'Good fit & limitations'}</h2>
                <p>
                  {showcase
                    ? pickLocalized(showcase.fit, locale)
                    : pickLocalized(skill.summary, locale)}
                </p>
                <p className="skill-muted">
                  {showcase
                    ? pickLocalized(showcase.limits, locale)
                    : isZh
                      ? '请在安装前查看该 Skill 的使用说明和依赖；输出仍需人工复核。'
                      : 'Review the Skill instructions and dependencies before installing. Outputs still need your review.'}
                </p>
              </section>
              <section>
                <h2>{isZh ? '开始前准备' : 'Before you start'}</h2>
                <h3>{isZh ? '你提供的资料' : 'You bring'}</h3>
                {showcase ? (
                  <ul>
                    {showcase.inputs.map((line, index) => (
                      <li key={index}>{pickLocalized(line, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {isZh
                      ? '以该 Skill 的安装指南和输入要求为准。'
                      : 'See this Skill’s installation guide for required inputs.'}
                  </p>
                )}
                <h3>{isZh ? '运行依赖' : 'Dependencies'}</h3>
                {showcase ? (
                  <ul>
                    {showcase.dependencies.map((line, index) => (
                      <li key={index}>{pickLocalized(line, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {isZh
                      ? '具体工具与版本要求见安装指南。'
                      : 'See the installation guide for tools and version requirements.'}
                  </p>
                )}
              </section>
              <section>
                <h2>{isZh ? '使用方式' : 'How it works'}</h2>
                <ol>
                  <li>
                    {isZh
                      ? '提供已获授权的素材，说明目标、语言与交付格式。'
                      : 'Bring approved material and specify your goal, language and deliverable.'}
                  </li>
                  <li>
                    {isZh
                      ? '安装到兼容的 Agent，按 Skill 的指引制作与调整。'
                      : 'Install into a compatible agent, then follow the Skill to create and refine.'}
                  </li>
                  <li>
                    {isZh
                      ? '核对内容与布局，导出并保留可编辑源文件。'
                      : 'Review content and layout, export, and keep the editable source.'}
                  </li>
                </ol>
              </section>
            </div>
            <section className="skill-faq">
              <h2>{isZh ? '常见问题' : 'FAQ'}</h2>
              <details>
                <summary>
                  {isZh ? '是否包含模型费用？' : 'Are model fees included?'}
                </summary>
                <p>
                  {isZh
                    ? '不包含。Skill 访问权益与 Agent、模型、API 的费用分开，具体依赖见上方说明。'
                    : 'No. Skill access is separate from agent, model and API fees. See the dependencies above.'}
                </p>
              </details>
              <details>
                <summary>
                  {isZh ? '能否为客户制作成品？' : 'Can I create client work?'}
                </summary>
                <p>
                  {isZh
                    ? '请遵守包内许可；可以交付获准的成品，不得转售通用 Skill 或模板库。素材权利由使用者确认。'
                    : 'Follow the included license. Deliver permitted finished work, without reselling the generic Skill or template library. You are responsible for input rights.'}
                </p>
              </details>
            </section>

            <RelatedSkills
              slug={skill.slug}
              outputType={skill.outputTypes[0] || 'image'}
              locale={locale}
              isZh={isZh}
            />
            {skill.versions.length ? (
              <section className="skill-versions">
                <h2>{isZh ? '更新记录' : 'Changelog'}</h2>
                <ul>
                  {skill.versions.map((version) => (
                    <li key={version.version}>
                      <strong>v{version.version}</strong>
                      {version.publishedAt ? (
                        <time dateTime={version.publishedAt}>
                          {new Date(version.publishedAt).toLocaleDateString(
                            locale
                          )}
                        </time>
                      ) : null}
                      <span>{pickLocalized(version.changelog, locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}

export default SkillDetailPage;
