import { SkillBrandHero } from './skill-catalog/SkillBrandHero';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '@/shared/ui';
import {
  listSkillCatalog,
  type SkillCatalogItem
} from '@/services/skill-catalog-api';
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

type Shelf = {
  status: 'loading' | 'ready' | 'error';
  items: SkillCatalogItem[];
};

function useShelf(query: Parameters<typeof listSkillCatalog>[0]): Shelf {
  const [shelf, setShelf] = useState<Shelf>({ status: 'loading', items: [] });
  const key = JSON.stringify(query);
  useEffect(() => {
    const controller = new AbortController();
    listSkillCatalog(query, controller.signal)
      .then((result) => setShelf({ status: 'ready', items: result.items }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
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
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="skill-shelf"
      initial={false}
      whileInView={reduced ? {} : { y: [14, 0] }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.4 }}
    >
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
      ) : shelf.status === 'error' || !shelf.items.length ? (
        <div className="skill-shelf-empty">
          <p>
            {shelf.status === 'error'
              ? isZh
                ? '商品目录暂时无法加载。请进入目录重试。'
                : 'The catalog is temporarily unavailable. Open the library to retry.'
              : isZh
                ? '这一组 Skill 正在准备中，可先浏览其他工作流。'
                : 'This collection is being prepared. Explore the other workflows.'}
          </p>
          <Link to={href}>{isZh ? '打开目录' : 'Open library'} →</Link>
        </div>
      ) : (
        <div className="skill-grid">
          {shelf.items.map((skill, index) => (
            <SkillCard
              key={skill.slug}
              skill={skill}
              locale={locale}
              isZh={isZh}
              eager={index < 4}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
}

export function SkillHomePage() {
  const { locale, isZh } = useMarketingLocale();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const featured = useShelf({ tier: 'premium', sort: 'featured', limit: 4 });
  const free = useShelf({ tier: 'free', sort: 'featured', limit: 4 });
  const [copied, setCopied] = useState(false);
  const prompt = cliConnectPrompt(isZh);

  useEffect(() => {
    const origin = window.location.origin;
    return applySeo({
      title: isZh
        ? 'WebToMind：发现、购买与使用创作 Skill'
        : 'WebToMind: discover creative Skills for your AI agent',
      description: isZh
        ? '探索内容创作、品牌营销、演示文稿、网页和视频工作流。先看案例与交付内容，免费体验或单独购买，再安装到你的 Agent。'
        : 'Explore Skills for content, campaigns, presentations, websites and videos. Review outputs and dependencies, start free or buy a workflow for your agent.',
      canonical: `${origin}/${locale}/overview`,
      alternates: [
        { hreflang: 'zh-CN', href: `${origin}/zh-CN/overview` },
        { hreflang: 'en-US', href: `${origin}/en-US/overview` },
        { hreflang: 'x-default', href: `${origin}/en-US/overview` }
      ]
    });
  }, [isZh, locale]);

  const steps = isZh
    ? [
        ['先看成品', '按任务找到工作流，查看示例、输入、依赖与许可。'],
        ['浏览器授权一次', 'CLI 打开浏览器让你登录确认，不需要 API Key。'],
        ['完成自己的项目', '用你的资料运行、修改与检查，再导出成品。']
      ]
    : [
        [
          'See the output',
          'Review examples, required inputs, dependencies and the package license.'
        ],
        [
          'Approve once in the browser',
          'The CLI opens your browser to sign in. No API key.'
        ],
        [
          'Make it yours',
          'Run with your own material, edit, check and export the result.'
        ]
      ];
  const faqs = isZh
    ? [
        [
          '什么是 Agent Skill？',
          'Skill 是一组说明、模板和脚本，让 AI Agent 稳定地完成某类工作。文字排版可以编辑，成品仍需核对内容与布局。'
        ],
        [
          '支持哪些 Agent？',
          'Claude Code、Codex、Cursor、Gemini CLI、Kimi Code、Antigravity 和 Trae，以及任何能读取 Skills 目录的 Agent。'
        ],
        [
          '需要 API Key 吗？',
          '安装 Skill 不需要 API Key。CLI 使用浏览器授权；运行时所需的模型或第三方服务由具体 Skill 说明。'
        ],
        ['可以随时取消吗？', '订阅可随时取消，当期结束前权益保持有效。']
      ]
    : [
        [
          'What is an Agent Skill?',
          'A Skill is a set of instructions, templates and scripts that lets an AI agent do one kind of work reliably. Editable layouts help control typography; you still review the content and final output.'
        ],
        [
          'Which agents are supported?',
          'Claude Code, Codex, Cursor, Gemini CLI, Kimi Code, Antigravity and Trae, plus any agent that reads a Skills folder.'
        ],
        [
          'Do I need an API key?',
          'Installing a Skill needs no API key: the CLI uses browser authorization. Each Skill lists any model or third-party service needed to run it.'
        ],
        [
          'Can I cancel?',
          'Cancel your subscription anytime; access stays active until the end of the paid period.'
        ]
      ];

  return (
    <div className="marketing-page-root skill-catalog-root">
      <TopNav />
      <main className="marketing-page-main skill-home">
        <SkillBrandHero locale={locale} isZh={isZh} />
        <section
          className="skill-discovery-heading"
          aria-labelledby="skill-discovery-title"
        >
          <div>
            <h2 id="skill-discovery-title">
              {isZh ? '今天，你想做点什么？' : 'What will you make next?'}
            </h2>
          </div>
          <form
            className="skill-hero-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(
                `/${locale}/skills${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`
              );
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={isZh ? '搜索创作任务' : 'Search creative tasks'}
              placeholder={
                isZh ? '搜索你要完成的任务' : 'Find a workflow for your idea'
              }
            />
            <Button type="submit" variant="primary">
              {isZh ? '搜索' : 'Search'} →
            </Button>
          </form>
        </section>
        <nav
          className="skill-task-nav"
          aria-label={isZh ? '按交付任务发现' : 'Discover by deliverable'}
        >
          {[
            ['image', '内容与营销', 'Content & campaigns', '01'],
            ['slides', '提案与演示', 'Decks & stories', '02'],
            ['web', '网站与转化', 'Websites & launches', '03'],
            ['video', '产品与视频', 'Demos & video', '04']
          ].map(([type, zh, en, number]) => (
            <Link key={type} to={`/${locale}/skills?type=${type}`}>
              <span>{number}</span>
              <strong>{isZh ? zh : en}</strong>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>

        <ShelfSection
          title={isZh ? '值得带走的工作流' : 'Built for your next big idea'}
          description={
            isZh
              ? '从内容到成品，把成熟的创作流程带进你的项目。'
              : 'Creative workflows with the structure, source files and examples to get you started.'
          }
          href={`/${locale}/skills?tier=premium`}
          shelf={featured}
          locale={locale}
          isZh={isZh}
        />
        <ShelfSection
          title={isZh ? '免费 Skill' : 'Free Skills'}
          description={
            isZh
              ? '选一个小任务，体验从想法到成品的完整过程。'
              : 'A small project is a good place to start. No card needed.'
          }
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
                <span className="skill-step-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="skill-install-strip" id="install">
          <div>
            <p className="skill-eyebrow">
              {isZh
                ? '把工作流带进你的 Agent'
                : 'Bring the workflow to your agent'}
            </p>
            <h2>
              {isZh ? '看清要求，再开始。' : 'Know what you need. Then start.'}
            </h2>
            <ul className="skill-agent-list">
              {SUPPORTED_AGENTS.slice(0, 4).map((agent) => (
                <li key={agent}>{agentLabel(agent)}</li>
              ))}
            </ul>
          </div>
          <details>
            <summary>
              {isZh ? '查看连接说明' : 'Show connection instructions'}
            </summary>
            <p className="skill-muted">
              {isZh
                ? '安装与可用性以当前官方安装指南为准。模型费用另计。'
                : 'Follow the current official guide for installation and availability. Model fees are separate.'}
            </p>
            <div className="skill-command">
              <code>{prompt}</code>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制' : 'Copy'}
              </Button>
            </div>
          </details>
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
