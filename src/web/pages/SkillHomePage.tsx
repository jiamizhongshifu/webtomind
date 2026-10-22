import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/shared/ui';
import { listSkillCatalog, type SkillCatalogItem } from '@/services/skill-catalog-api';
import { applySeo } from '../lib/seo';
import { TopNav } from '../components/TopNav';
import { MarketingFooter } from '../components/MarketingFooter';
import { useMarketingLocale } from '../lib/marketing-locale';
import {
  SUPPORTED_AGENTS,
  SkillCard,
  SkillGridSkeleton,
  agentLabel,
  cliConnectPrompt
} from './skill-catalog/skillCatalogShared';
import { SkillPricingSection } from './skill-catalog/SkillPricingSection';
import '../styles/marketing-pages.css';
import '../styles/skill-catalog.css';

type Shelf = { status: 'loading' | 'ready' | 'error'; items: SkillCatalogItem[] };

function useShelf(query: Parameters<typeof listSkillCatalog>[0]): Shelf {
  const [shelf, setShelf] = useState<Shelf>({ status: 'loading', items: [] });
  const key = JSON.stringify(query);
  useEffect(() => {
    const controller = new AbortController();
    listSkillCatalog(query, controller.signal)
      .then((result) => setShelf({ status: 'ready', items: result.items }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setShelf({ status: 'error', items: [] });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shelf;
}

function ShelfSection({
  title,
  description,
  href,
  shelf,
  locale,
  isZh
}: {
  title: string;
  description: string;
  href: string;
  shelf: Shelf;
  locale: string;
  isZh: boolean;
}) {
  if (shelf.status === 'ready' && shelf.items.length === 0) return null;
  if (shelf.status === 'error') return null;
  return (
    <section className="skill-shelf">
      <div className="skill-section-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <ButtonLink to={href} variant="ghost" size="sm">
          {isZh ? '查看全部' : 'View all'}
        </ButtonLink>
      </div>
      {shelf.status === 'loading' ? (
        <SkillGridSkeleton count={4} />
      ) : (
        <div className="skill-grid">
          {shelf.items.map((skill, index) => (
            <SkillCard key={skill.slug} skill={skill} locale={locale} isZh={isZh} eager={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}

export function SkillHomePage() {
  const { locale, isZh } = useMarketingLocale();
  const featured = useShelf({ sort: 'featured', limit: 8 });
  const free = useShelf({ tier: 'free', sort: 'trending', limit: 8 });
  const [copied, setCopied] = useState(false);
  const prompt = cliConnectPrompt(isZh);

  useEffect(() => {
    const origin = window.location.origin;
    return applySeo({
      title: isZh
        ? 'WebToMind：给你的 Agent 装上商业视觉 Skill'
        : 'WebToMind: commercial visual Skills for your AI agent',
      description: isZh
        ? '小红书封面、电商主图、发布会幻灯片、落地页和短视频 Skill，装进 Claude Code、Codex、Cursor、Trae，一句话产出可交付的成品。'
        : 'Skills for OG images, posters, decks, landing pages and short videos. Install into Claude Code, Codex, Cursor or Trae and get finished results from one request.',
      canonical: `${origin}/${locale}/overview`,
      alternates: [
        { hreflang: 'zh-CN', href: `${origin}/zh-CN/overview` },
        { hreflang: 'en-US', href: `${origin}/en-US/overview` },
        { hreflang: 'x-default', href: `${origin}/` }
      ]
    });
  }, [isZh, locale]);

  const steps = isZh
    ? [
        ['挑一个 Skill', '按你要做的东西搜索，或让 Agent 帮你推荐。'],
        ['浏览器授权一次', 'CLI 打开浏览器让你登录确认，不需要 API Key。'],
        ['一句话出成品', 'Skill 装进 Agent 后，描述需求就能拿到 PNG、PDF、MP4 或网页。']
      ]
    : [
        ['Pick a Skill', 'Search by what you want to make, or let your agent recommend one.'],
        ['Approve once in the browser', 'The CLI opens your browser to sign in. No API key.'],
        ['Ask, and get the file', 'Describe what you need and receive a PNG, PDF, MP4 or web page.']
      ];
  const faqs = isZh
    ? [
        ['什么是 Agent Skill？', 'Skill 是一组说明、模板和脚本，让 AI Agent 稳定地完成某类工作。WebToMind 的 Skill 用排版引擎渲染文字，不会出现错字。'],
        ['支持哪些 Agent？', 'Claude Code、Codex、Cursor、Gemini CLI、Kimi Code、Antigravity 和 Trae，以及任何能读取 Skills 目录的 Agent。'],
        ['需要 API Key 吗？', '不需要。CLI 通过浏览器授权登录，凭证保存在系统钥匙串里。'],
        ['可以随时取消吗？', '订阅可随时取消，当期结束前权益保持有效。']
      ]
    : [
        ['What is an Agent Skill?', 'A Skill is a set of instructions, templates and scripts that lets an AI agent do one kind of work reliably. WebToMind Skills typeset text with a layout engine, so there are no garbled letters.'],
        ['Which agents are supported?', 'Claude Code, Codex, Cursor, Gemini CLI, Kimi Code, Antigravity and Trae, plus any agent that reads a Skills folder.'],
        ['Do I need an API key?', 'No. The CLI signs in through your browser and keeps its credential in your system keychain.'],
        ['Can I cancel?', 'Cancel your subscription anytime; access stays active until the end of the paid period.']
      ];

  return (
    <div className="marketing-page-root skill-catalog-root">
      <TopNav />
      <main className="marketing-page-main skill-home">
        <section className="skill-hero">
          <p className="skill-eyebrow">{isZh ? '商业视觉 Agent Skills' : 'Commercial visual Agent Skills'}</p>
          <h1>{isZh ? '给你的 Agent 装上设计品味' : 'Give your agent design taste'}</h1>
          <p className="skill-hero-lead">
            {isZh
              ? '封面、主图、幻灯片、落地页和短视频，每个 Skill 都由我们设计和实测。装进 Agent，一句话拿到能直接发布的成品。'
              : 'Covers, product shots, decks, landing pages and short videos, each Skill designed and tested by us. Install it, ask once, and get something you can publish.'}
          </p>
          <div className="skill-hero-actions">
            <ButtonLink to={`/${locale}/skills`} variant="primary" size="lg">
              {isZh ? '浏览 Skill' : 'Browse Skills'}
            </ButtonLink>
            <ButtonLink to={`/${locale}/skills/pricing`} variant="secondary" size="lg">
              {isZh ? '查看价格' : 'See pricing'}
            </ButtonLink>
          </div>
          <div className="skill-connect">
            <p className="skill-connect-label">{isZh ? '或者把这句话发给你的 Agent' : 'Or send this to your agent'}</p>
            <div className="skill-command skill-command--prompt">
              <code>{prompt}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制' : 'Copy'}
              </Button>
            </div>
            <ul className="skill-agent-list" aria-label={isZh ? '支持的 Agent' : 'Supported agents'}>
              {SUPPORTED_AGENTS.map((agent) => (
                <li key={agent}>{agentLabel(agent)}</li>
              ))}
            </ul>
          </div>
        </section>

        <ShelfSection
          title={isZh ? '精选 Skill' : 'Featured Skills'}
          description={isZh ? '我们最新设计、实测过的 Skill。' : 'Our newest designed and tested Skills.'}
          href={`/${locale}/skills`}
          shelf={featured}
          locale={locale}
          isZh={isZh}
        />
        <ShelfSection
          title={isZh ? '免费 Skill' : 'Free Skills'}
          description={isZh ? '装一个跑一遍，成品归你，无需信用卡。' : 'Install one, run it end to end, keep the result. No card needed.'}
          href={`/${locale}/skills?tier=free`}
          shelf={free}
          locale={locale}
          isZh={isZh}
        />

        <section className="skill-steps" aria-labelledby="skill-steps-title">
          <h2 id="skill-steps-title">{isZh ? '三步用上' : 'How it works'}</h2>
          <ol>
            {steps.map(([title, text], index) => (
              <li key={title}>
                <span className="skill-step-index">{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <SkillPricingSection locale={locale} isZh={isZh} />

        <section className="skill-faq" aria-labelledby="skill-faq-title">
          <h2 id="skill-faq-title">{isZh ? '常见问题' : 'FAQ'}</h2>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default SkillHomePage;
