import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  catalog,
  guidePath,
  installGuide,
  starterPrompt,
  text
} from './discovery';
export function GettingStarted({
  slug,
  locale
}: {
  slug: string;
  locale: string;
}) {
  const [agent, setAgent] = useState('codex');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const zh = locale === 'zh-CN';
  const prompt = starterPrompt(slug, locale);
  if (!prompt) return null;
  return (
    <section className="siskill-start" aria-labelledby={`start-${slug}`}>
      <div>
        <p className="skill-muted">
          v{catalog.find((s) => s.slug === slug)?.latestVersion}
        </p>
        <h2 id={`start-${slug}`}>
          {zh
            ? '安装后，完成第一个任务'
            : 'Your first task, after installation'}
        </h2>
        <p>
          {zh
            ? '登录并获取安装包后，解压到项目中的 Skill 目录。先检查包内依赖，再运行下面的需求。'
            : 'Sign in and get the package, then extract it into your project’s Skill folder. Check its dependencies before running this brief.'}
        </p>
        <Link to={`/${locale}${guidePath}`}>
          {zh
            ? '完整安装与排错指引 →'
            : 'Installation & troubleshooting guide →'}
        </Link>
      </div>
      <div className="siskill-start-actions">
        <label>
          {zh ? '使用的 Agent' : 'Your agent'}{' '}
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
          </select>
        </label>
        <code>
          {agent === 'codex' ? '.agents' : '.claude'}/skills/{slug}/SKILL.md
        </code>
        <p>{prompt}</p>
        <button
          className="siskill-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setCopyError(false);
            } catch {
              setCopyError(true);
            }
          }}
        >
          {copied
            ? zh
              ? '已复制需求'
              : 'Brief copied'
            : zh
              ? '复制首次使用需求'
              : 'Copy starter brief'}
        </button>
        <span role="status">
          {copyError
            ? zh
              ? '复制不可用，请手动选择上方文字。'
              : 'Copy unavailable. Select the brief above manually.'
            : ''}
        </span>
      </div>
    </section>
  );
}
export function InstallGuide({ locale }: { locale: string }) {
  const guide = installGuide(locale),
    zh = locale === 'zh-CN';
  return (
    <article className="siskill-guide">
      <header className="skill-hero">
        <p className="skill-muted">
          SiSkill / {zh ? '使用指南' : 'Getting started'}
        </p>
        <h1>{guide.title}</h1>
        <p>{guide.intro}</p>
      </header>
      <nav
        className="siskill-guide-toc"
        aria-label={zh ? '本页目录' : 'On this page'}
      >
        {guide.sections.map(([title], i) => (
          <a key={title} href={`#step-${i + 1}`}>
            {title}
          </a>
        ))}
      </nav>
      {guide.sections.map(([title, body], i) => (
        <section key={title} id={`step-${i + 1}`}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <section>
        <h2>{zh ? '遇到问题' : 'Troubleshooting'}</h2>
        <p>{guide.troubleshooting}</p>
        <a href="mailto:support@webtomind.com?subject=SiSkill">
          {zh ? '联系支持' : 'Contact support'}
        </a>
      </section>
      <section>
        <h2>{zh ? '从一个真实任务开始' : 'Start with a real task'}</h2>
        {catalog
          .filter((s) => s.availability === 'available')
          .map((s) => (
            <p key={s.slug}>
              <Link to={`/${locale}/skills/${s.slug}`}>
                {text(s.name, locale)} →
              </Link>
            </p>
          ))}
      </section>
    </article>
  );
}
