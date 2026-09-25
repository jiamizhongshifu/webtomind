import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Star } from 'lucide-react';
import type { PromptCase } from '@/services/agent-api';
import { Button } from '@/shared/ui/radix/button';

interface PromptLibraryCardProps {
  caseItem: PromptCase;
  index: number;
  href: string;
  createHref: string;
  isZh: boolean;
  caseTitle: string;
  previewText: string;
  isFavorited: boolean;
  media: ReactNode;
  highPriorityCount: number;
  onOpen: (event: MouseEvent<HTMLElement>, caseItem: PromptCase) => void;
  onUse: (caseItem: PromptCase) => void;
  onToggleFavorite: (caseId: string) => void;
}

export function PromptLibraryCard({
  caseItem,
  index,
  href,
  createHref,
  isZh,
  caseTitle,
  previewText,
  isFavorited,
  media,
  highPriorityCount,
  onOpen,
  onUse,
  onToggleFavorite
}: PromptLibraryCardProps) {
  return (
    <div className="prompt-browser-case-shell">
      <Link
        to={href}
        className={
          index < highPriorityCount
            ? 'prompt-browser-case-card prompt-browser-case-card-priority'
            : 'prompt-browser-case-card'
        }
        onClick={(event) => onOpen(event, caseItem)}
        aria-label={
          isZh
            ? `预览 Prompt 案例：${caseTitle}`
            : `Preview prompt case: ${caseTitle}`
        }
        itemScope
        itemType="https://schema.org/CreativeWork"
      >
        <meta itemProp="url" content={href} />
        <meta itemProp="name" content={caseTitle} />
        {previewText && <meta itemProp="description" content={previewText} />}
        {media}
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          isFavorited
            ? 'prompt-browser-case-favorite active'
            : 'prompt-browser-case-favorite'
        }
        aria-label={
          isZh
            ? isFavorited
              ? `取消收藏案例：${caseTitle}`
              : `收藏案例：${caseTitle}`
            : isFavorited
              ? `Unsave case: ${caseTitle}`
              : `Save case: ${caseTitle}`
        }
        aria-pressed={isFavorited}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleFavorite(caseItem.id);
        }}
      >
        <Star fill={isFavorited ? 'currentColor' : 'none'} />
      </Button>
      <Link
        to={createHref}
        className="prompt-browser-case-use-cta"
        aria-label={
          isZh ? `使用创意：${caseTitle}` : `Use this idea: ${caseTitle}`
        }
        onClick={(event) => {
          onUse(caseItem);
          event.stopPropagation();
        }}
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>{isZh ? '使用创意' : 'Use idea'}</span>
      </Link>
    </div>
  );
}
