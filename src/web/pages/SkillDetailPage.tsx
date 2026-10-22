import { useEffect, useState } from 'react';
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
import { agentLabel, formatInstalls, outputLabel } from './skill-catalog/skillCatalogShared';
import '../styles/marketing-pages.css';
import '../styles/skill-catalog.css';

function installCommand(slug: string, agent: string): string {
  // The CLI installs into Claude Code unless told otherwise.
  const base = `npx webtomind-cli install ${slug}`;
  return agent === 'claude-code' ? base : `${base} --agent ${agent}`;
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

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSkillCatalogDetail(id, controller.signal)
      .then((skill) => {
        setState({ status: 'ready', skill });
        if (skill.compatibleAgents.length && !skill.compatibleAgents.includes('claude-code')) {
          setAgent(skill.compatibleAgents[0]);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
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
    const firstImage = skill.examples.find((example) => !example.mediaUrl.endsWith('.mp4'));
    return applySeo({
      title: `${name} · Agent Skill | WebToMind`,
      description: pickLocalized(skill.summary, locale),
      canonical: `${window.location.origin}/${locale}${path}`,
      ogImage: firstImage?.mediaUrl || firstImage?.posterUrl || undefined,
      alternates: [
        { hreflang: 'zh-CN', href: `${window.location.origin}/zh-CN${path}` },
        { hreflang: 'en-US', href: `${window.location.origin}/en-US${path}` },
        { hreflang: 'x-default', href: `${window.location.origin}/en-US${path}` }
      ]
    });
  }, [locale, name, skill]);

  return (
    <div className="marketing-page-root skill-catalog-root">
      <TopNav />
      <main className="marketing-page-main skill-detail">
        <nav className="skill-breadcrumb" aria-label={isZh ? '面包屑' : 'Breadcrumb'}>
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
            <h1>{isZh ? '这个 Skill 不存在或已下架' : 'This Skill does not exist or was removed'}</h1>
            <ButtonLink to={`/${locale}/skills`} variant="primary">
              {isZh ? '浏览全部 Skill' : 'Browse all Skills'}
            </ButtonLink>
          </div>
        ) : state.status === 'error' || !skill ? (
          <div className="skill-empty">
            <h1>{isZh ? 'Skill 暂时无法加载' : 'This Skill could not load'}</h1>
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              {isZh ? '重试' : 'Try again'}
            </Button>
          </div>
        ) : (
          <>
            <header className="skill-detail-header">
              <div className="skill-detail-badges">
                <Badge variant={skill.tier === 'free' ? 'success' : 'accent'}>
                  {skill.tier === 'free' ? (isZh ? '免费' : 'Free') : 'Pro'}
                </Badge>
                {skill.outputTypes.map((type) => (
                  <Badge key={type}>{outputLabel(type, isZh)}</Badge>
                ))}
              </div>
              <h1>{name}</h1>
              <p className="skill-detail-summary">{pickLocalized(skill.description, locale)}</p>
              <p className="skill-detail-meta">
                {formatInstalls(skill.installCount, isZh)}
                {skill.latestVersion ? ` · v${skill.latestVersion}` : ''}
              </p>
            </header>

            <div className="skill-detail-layout">
              <section className="skill-detail-examples" aria-label={isZh ? '真实成品' : 'Real results'}>
                <h2>{isZh ? '这个 Skill 真实做出来的成品' : 'Made by this Skill'}</h2>
                {skill.examples.length === 0 ? (
                  <p className="skill-muted">{isZh ? '成品案例即将上线。' : 'Examples are coming soon.'}</p>
                ) : (
                  <div className="skill-example-grid">
                    {skill.examples.map((example, index) => {
                      const title = pickLocalized(example.title, locale);
                      return (
                        <figure key={`${example.mediaUrl}-${index}`} className="skill-example">
                          {example.mediaUrl.endsWith('.mp4') ? (
                            <video
                              src={example.mediaUrl}
                              poster={example.posterUrl || undefined}
                              controls
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              src={example.mediaUrl}
                              alt={title}
                              loading={index === 0 ? 'eager' : 'lazy'}
                              decoding="async"
                            />
                          )}
                          {title ? <figcaption>{title}</figcaption> : null}
                        </figure>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside className="skill-install-panel" aria-label={isZh ? '安装' : 'Install'}>
                <h2>{isZh ? '安装到你的 Agent' : 'Install into your agent'}</h2>
                <div className="skill-agent-tabs" role="group" aria-label={isZh ? '选择 Agent' : 'Choose agent'}>
                  {(skill.compatibleAgents.length ? skill.compatibleAgents : ['claude-code']).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        className="skill-pill"
                        aria-pressed={agent === value}
                        onClick={() => setAgent(value)}
                      >
                        {agentLabel(value)}
                      </button>
                    )
                  )}
                </div>
                <div className="skill-command">
                  <code>{installCommand(skill.slug, agent)}</code>
                  <CopyButton text={installCommand(skill.slug, agent)} isZh={isZh} />
                </div>
                <p className="skill-muted">
                  {isZh
                    ? '首次使用会打开浏览器让你登录授权，不需要 API Key。需要 Node.js 22 或更高版本。'
                    : 'The first run opens your browser to sign in and approve. No API key needed. Requires Node.js 22+.'}
                </p>
                {skill.tier === 'premium' ? (
                  <div className="skill-upgrade">
                    <p>
                      {isZh
                        ? '这是 Pro Skill：订阅 Skill Pro 或买断后即可安装全部 Pro Skill。'
                        : 'This is a Pro Skill. Subscribe to Skill Pro or buy lifetime access to install every Pro Skill.'}
                    </p>
                    <ButtonLink to={`/${locale}/skills/pricing`} variant="primary" size="md">
                      {isZh ? '查看方案' : 'See plans'}
                    </ButtonLink>
                  </div>
                ) : null}
              </aside>
            </div>

            {skill.versions.length ? (
              <section className="skill-versions">
                <h2>{isZh ? '更新记录' : 'Changelog'}</h2>
                <ul>
                  {skill.versions.map((version) => (
                    <li key={version.version}>
                      <strong>v{version.version}</strong>
                      {version.publishedAt ? (
                        <time dateTime={version.publishedAt}>
                          {new Date(version.publishedAt).toLocaleDateString(locale)}
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
