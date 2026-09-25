import { useState } from 'react';
import { Check, Eye, RefreshCw, Save, Search } from 'lucide-react';
import { AiUsageSummaryPanel } from '../components/image-create/AiUsageSummaryPanel';
import { imagePromptSlots } from '../data/image-prompt-core';
import type { AiUsageSummaryResult } from '@/services/agent-api';
import { Button } from '@/shared/ui/radix/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/shared/ui/radix/empty';
import { Field, FieldLabel } from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Textarea } from '@/shared/ui/radix/textarea';
import '../styles/image-create.css';

const usageSummary: AiUsageSummaryResult = {
  filters: {
    from: '2026-06-06',
    to: '2026-07-05',
    limit: 200
  },
  totals: {
    eventCount: 1284,
    succeededCount: 1250,
    failedCount: 34,
    inputTokens: 420000,
    outputTokens: 780000,
    totalTokens: 1200000,
    imageCount: 642
  },
  items: [
    {
      usageDate: '2026-07-05',
      provider: 'openai',
      model: 'gpt-image-2',
      source: 'image_create_page',
      eventCount: 312,
      succeededCount: 307,
      failedCount: 5,
      inputTokens: 92000,
      outputTokens: 148000,
      totalTokens: 240000,
      imageCount: 156,
      avgLatencyMs: 2840,
      p95LatencyMs: 6120
    },
    {
      usageDate: '2026-07-04',
      provider: 'fal',
      model: 'nano-banana',
      source: 'prompt_case_recreate',
      eventCount: 184,
      succeededCount: 180,
      failedCount: 4,
      inputTokens: 36000,
      outputTokens: 66000,
      totalTokens: 102000,
      imageCount: 92,
      avgLatencyMs: 1320,
      p95LatencyMs: 3100
    }
  ]
};

function loadUsageSummary() {
  return Promise.resolve(usageSummary);
}

export function PromptOpsSurfacesHarnessPage() {
  const [slot, setSlot] = useState<string>('character');
  const [assetSlot, setAssetSlot] = useState<string>(
    imagePromptSlots[0]?.id || ''
  );
  const [query, setQuery] = useState('');

  return (
    <main
      className="image-create-page"
      data-harness="prompt-ops-surfaces"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: '#f6f3ee',
        color: '#141414',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
        ISOLATED PREVIEW HARNESS
      </p>
      <h1 style={{ margin: '8px 0 16px', fontSize: 22 }}>
        Prompt Ops Surfaces
      </h1>

      <section className="prompt-ops-workbench" style={{ maxWidth: 1180 }}>
        <aside className="creator-panel prompt-ops-list">
          <div className="creator-panel-head">
            <span>素材列表</span>
            <strong>2</strong>
          </div>
          <div className="prompt-ops-toolbar">
            <div className="creator-select">
              <Select value={slot} onValueChange={setSlot}>
                <SelectTrigger
                  className="prompt-ops-select-trigger"
                  aria-label="筛选素材位置"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部位置</SelectItem>
                    {imagePromptSlots.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="icon">
              <RefreshCw data-icon="inline-start" />
            </Button>
          </div>
          <div className="creator-search">
            <Search size={16} />
            <Input
              value={query}
              placeholder="搜索标题、标签、Prompt"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="prompt-ops-asset-list">
            {['高级角色肖像', '柔和产品海报'].map((title, index) => (
              <button
                key={title}
                type="button"
                className={index === 0 ? 'active' : ''}
              >
                <img
                  src={`/assets/${index === 0 ? 'character.B6jtQtim.webp' : 'product.CyuQS9ek.webp'}`}
                  alt=""
                />
                <span>
                  <strong>{title}</strong>
                  <small>{slot} · 已发布</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="creator-panel prompt-ops-editor">
          <div className="creator-panel-head">
            <span>编辑素材</span>
            <div className="creator-library-status">
              <small>样例数据</small>
              <strong>ON</strong>
            </div>
          </div>
          <div className="prompt-ops-preview">
            <img src="/assets/character.B6jtQtim.webp" alt="" />
            <div>
              <strong>character-premium-portrait</strong>
              <small>2026-07-05</small>
            </div>
          </div>
          <div className="prompt-ops-form-grid">
            <Field className="prompt-ops-field">
              <FieldLabel>位置</FieldLabel>
              <Select value={assetSlot} onValueChange={setAssetSlot}>
                <SelectTrigger className="prompt-ops-select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {imagePromptSlots.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="prompt-ops-field">
              <FieldLabel>排序</FieldLabel>
              <Input type="number" value={10} readOnly />
            </Field>
            <Field className="prompt-ops-field">
              <FieldLabel>标题</FieldLabel>
              <Input value="高级角色肖像" readOnly />
            </Field>
            <Field className="prompt-ops-field">
              <FieldLabel>副标题</FieldLabel>
              <Input value="适合角色设定与头像风格探索" readOnly />
            </Field>
            <Field className="prompt-ops-field wide">
              <FieldLabel>Prompt（英文，喂模型）</FieldLabel>
              <Textarea
                value="A polished character portrait with refined lighting, editorial composition, and expressive details."
                readOnly
              />
            </Field>
            <Field className="prompt-ops-field wide">
              <FieldLabel>Metadata JSON</FieldLabel>
              <Textarea value={'{\n  "source": "harness"\n}'} readOnly />
            </Field>
          </div>
          <div className="prompt-ops-actions">
            <Button type="button" variant="outline" className="secondary">
              <Eye data-icon="inline-start" />
              设为发布
            </Button>
            <Button type="button">
              <Save data-icon="inline-start" />
              保存
            </Button>
          </div>
        </section>

        <Empty className="creator-picker-empty prompt-ops-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Check />
            </EmptyMedia>
            <EmptyTitle>请选择一个素材</EmptyTitle>
            <EmptyDescription>
              从左侧列表选择素材后，可以编辑标题、Prompt、标签和上下架状态。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>

      <section style={{ maxWidth: 1180, marginTop: 20 }}>
        <AiUsageSummaryPanel
          isZh
          headingId="prompt-ops-harness-ai-usage"
          loadSummary={loadUsageSummary}
        />
      </section>
    </main>
  );
}
