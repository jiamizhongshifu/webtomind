import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LocalizedText } from '@/shared/prompt-seo-content';
import {
  SREF_EXTERNAL_REFERENCES,
  SREF_EXTERNAL_SOURCE
} from '@/shared/sref-external-references';
import { Card } from '@/shared/ui';
import { Button } from '@/shared/ui/radix/button';

type PromptLibraryRelatedSeoLink = {
  href: string;
  label: string;
};

type PromptLibrarySeoSection = {
  title: LocalizedText;
  body?: LocalizedText;
  items: LocalizedText[];
};

type PromptLibrarySeoFaqItem = {
  question: LocalizedText;
  answer: LocalizedText;
};

interface PromptLibrarySeoContentProps {
  isZh: boolean;
  showSrefReferences: boolean;
  hasRichSeoContent: boolean;
  richBadge: string;
  richIntent: string;
  richKeywords: string[];
  shouldShowStyleGridCta: boolean;
  relatedSeoLinks: PromptLibraryRelatedSeoLink[];
  richWorkflow: LocalizedText[];
  richExamples: LocalizedText[];
  richSections: PromptLibrarySeoSection[];
  richFaq: PromptLibrarySeoFaqItem[];
}

function text(value: LocalizedText, isZh: boolean): string {
  return isZh ? value.zh : value.en;
}

export function PromptLibrarySeoContent({
  isZh,
  showSrefReferences,
  hasRichSeoContent,
  richBadge,
  richIntent,
  richKeywords,
  shouldShowStyleGridCta,
  relatedSeoLinks,
  richWorkflow,
  richExamples,
  richSections,
  richFaq
}: PromptLibrarySeoContentProps) {
  return (
    <>
      {showSrefReferences && (
        <section className="prompt-browser-case-section">
          <div className="prompt-browser-section-title">
            <h2>{isZh ? '外部 SREF 参考' : 'External SREF references'}</h2>
          </div>
          <div className="prompt-browser-sref-grid">
            {SREF_EXTERNAL_REFERENCES.map((item) => (
              <Card
                as="a"
                key={item.code}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="interactive"
                density="compact"
                className="prompt-browser-sref-card"
              >
                <span>{`--sref ${item.code}`}</span>
                <h3>{item.title}</h3>
                <p>
                  {isZh
                    ? `${SREF_EXTERNAL_SOURCE.name} 热度 ${item.likes.toLocaleString('zh-CN')}，用于临时风格参考，不是 WebToMind 原创案例。`
                    : `${SREF_EXTERNAL_SOURCE.name} popularity ${item.likes.toLocaleString('en-US')}. Temporary style reference, not an original WebToMind case.`}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {hasRichSeoContent && (
        <section className="prompt-browser-seo-content">
          <section className="prompt-seo-hero-panel">
            <div>
              <span className="prompt-seo-badge">{richBadge}</span>
              <p>{richIntent}</p>
            </div>
            <div className="prompt-seo-keywords" aria-label="SEO keywords">
              {richKeywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </section>

          {shouldShowStyleGridCta && (
            <section className="prompt-seo-style-grid-cta">
              <div>
                <span>New workflow</span>
                <h2>Build your theme card</h2>
                <p>
                  Pick style, lighting, background and lens slots, download a
                  shareable card, then open the same direction in WebToMind
                  Create when you need assisted generation.
                </p>
              </div>
              <Button asChild className="prompt-seo-style-grid-link" size="sm">
                <Link to="/ai-image-style-grid">
                  Open Theme Cards
                  <ExternalLink data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            </section>
          )}

          {relatedSeoLinks.length > 0 && (
            <section
              className="marketing-category-row"
              aria-label={isZh ? '相关 Prompt 专题' : 'Related prompt topics'}
            >
              {relatedSeoLinks.map((item) => (
                <Button
                  asChild
                  key={`${item.href}:${item.label}`}
                  className="marketing-category-pill"
                  variant="outline"
                >
                  <Link to={item.href}>{item.label}</Link>
                </Button>
              ))}
            </section>
          )}

          {(richWorkflow.length > 0 || richExamples.length > 0) && (
            <section className="marketing-grid two-col prompt-seo-section-grid">
              {richWorkflow.length > 0 && (
                <Card
                  as="article"
                  variant="flat"
                  className="marketing-card ui-card--web prompt-seo-card"
                >
                  <h2>{isZh ? '推荐工作流' : 'Recommended workflow'}</h2>
                  <ol>
                    {richWorkflow.map((step) => (
                      <li key={step.en}>{text(step, isZh)}</li>
                    ))}
                  </ol>
                </Card>
              )}
              {richExamples.length > 0 && (
                <Card
                  as="article"
                  variant="flat"
                  className="marketing-card ui-card--web prompt-seo-card"
                >
                  <h2>{isZh ? '可复用案例' : 'Reusable examples'}</h2>
                  <ul>
                    {richExamples.map((example) => (
                      <li key={example.en}>{text(example, isZh)}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          )}

          {richSections.length > 0 && (
            <section className="marketing-grid two-col prompt-seo-section-grid">
              {richSections.map((section) => (
                <Card
                  as="article"
                  variant="flat"
                  className="marketing-card ui-card--web prompt-seo-card"
                  key={section.title.en}
                >
                  <h2>{text(section.title, isZh)}</h2>
                  {section.body && <p>{text(section.body, isZh)}</p>}
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.en}>{text(item, isZh)}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </section>
          )}

          {richFaq.length > 0 && (
            <section className="prompt-seo-faq">
              {richFaq.map((item) => (
                <article key={item.question.en} className="prompt-seo-faq-item">
                  <h2>{text(item.question, isZh)}</h2>
                  <p>{text(item.answer, isZh)}</p>
                </article>
              ))}
            </section>
          )}
        </section>
      )}
    </>
  );
}
