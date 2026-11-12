import { Link } from 'react-router-dom';
import { Badge } from '@/shared/ui';
import {
  pickLocalized,
  type SkillCatalogItem,
  type SkillOutputType
} from '@/services/skill-catalog-api';
import { createSkillCoverDataUrl } from '../../lib/skill-cover';

export const OUTPUT_TYPES: SkillOutputType[] = ['image', 'slides', 'web', 'video'];

const OUTPUT_LABELS: Record<SkillOutputType, { zh: string; en: string }> = {
  image: { zh: '图片', en: 'Images' },
  slides: { zh: '幻灯片', en: 'Slides' },
  web: { zh: '网页', en: 'Web pages' },
  video: { zh: '视频', en: 'Video' }
};

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  'kimi-code': 'Kimi Code',
  antigravity: 'Antigravity',
  trae: 'Trae'
};

export const SUPPORTED_AGENTS = Object.keys(AGENT_LABELS);

export function outputLabel(type: string, isZh: boolean): string {
  const label = OUTPUT_LABELS[type as SkillOutputType];
  return label ? (isZh ? label.zh : label.en) : type;
}

export function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] || agent;
}

export function formatInstalls(count: number, isZh: boolean): string {
  const value = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  return isZh ? `${value} 次安装` : `${value} installs`;
}

export function cliConnectPrompt(isZh: boolean): string {
  const origin =
    typeof window === 'undefined' ? 'https://webtomind.com' : window.location.origin;
  return isZh
    ? `阅读 ${origin}/install/agent.md 并按说明连接 WebToMind，然后帮我挑一个合适的 Skill。`
    : `Read ${origin}/install/agent.md and follow it to connect WebToMind, then help me pick the right Skill.`;
}

export function SkillCard({
  skill,
  locale,
  isZh,
  eager = false
}: {
  skill: SkillCatalogItem;
  locale: string;
  isZh: boolean;
  eager?: boolean;
}) {
  const name = pickLocalized(skill.name, locale) || skill.slug;
  const type = skill.outputTypes[0] || 'image';
  const cover = skill.coverUrl || createSkillCoverDataUrl(name, outputLabel(type, isZh));
  return (
    <Link to={`/${locale}/skills/${skill.slug}`} className="skill-card">
      <div className="skill-card-cover">
        <img
          src={cover}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          width={640}
          height={400}
        />
        <Badge
          size="sm"
          variant={skill.tier === 'free' ? 'success' : 'accent'}
          className="skill-card-tier"
        >
          {skill.tier === 'free' ? (isZh ? '免费' : 'Free') : 'Pro'}
        </Badge>
      </div>
      <div className="skill-card-body">
        <span className="skill-card-type">{outputLabel(type, isZh)}</span>
        <h3>{name}</h3>
        <p>{pickLocalized(skill.summary, locale)}</p>
        <span className="skill-card-installs">{formatInstalls(skill.installCount, isZh)}</span>
      </div>
    </Link>
  );
}

export function SkillGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="skill-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skill-card skill-card--skeleton">
          <div className="skill-card-cover" />
          <div className="skill-card-body">
            <span className="skill-skeleton-line" />
            <span className="skill-skeleton-line skill-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}
