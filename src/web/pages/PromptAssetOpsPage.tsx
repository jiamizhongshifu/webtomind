import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/image-create.css';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Search
} from 'lucide-react';
import {
  getAdminPromptAssets,
  saveAdminPromptAsset,
  unpublishAdminPromptAsset,
  type AdminPromptAsset
} from '@/services/agent-api';
import { TopNav } from '../components/TopNav';
import { useAuth } from '../contexts/AuthContext';
import { imagePromptSlots } from '../data/image-prompt-core';
import { applySeo } from '../lib/seo';
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
type SlotFilter = AdminPromptAsset['slot'] | 'all';

interface EditablePromptAsset extends AdminPromptAsset {
  tagsText: string;
  visualText: string;
  metadataText: string;
  promptZhText: string;
  negativePromptZhText: string;
}

function toEditable(asset: AdminPromptAsset): EditablePromptAsset {
  const metadata = { ...(asset.metadata || {}) } as Record<string, unknown>;
  const promptZh =
    typeof metadata.promptZh === 'string' ? metadata.promptZh : '';
  const negativePromptZh =
    typeof metadata.negativePromptZh === 'string'
      ? metadata.negativePromptZh
      : '';
  // 把中文字段从 metadata JSON 里剥出来用独立 textarea 编辑，避免双写冲突
  delete metadata.promptZh;
  delete metadata.negativePromptZh;
  return {
    ...asset,
    tagsText: (asset.tags || []).join(', '),
    visualText: JSON.stringify(asset.visual || {}, null, 2),
    metadataText: JSON.stringify(metadata, null, 2),
    promptZhText: promptZh,
    negativePromptZhText: negativePromptZh
  };
}

function parseJsonObject(
  value: string,
  label: string
): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

export function PromptAssetOpsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [assets, setAssets] = useState<AdminPromptAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditablePromptAsset | null>(null);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [query, setQuery] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 素材库运营台',
      description:
        '维护 WebToMind 图像创作台的提示词素材、图片、标签和上下架状态。',
      robots: 'noindex,nofollow',
      htmlLang: 'zh-CN'
    });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const loadAssets = async () => {
    setIsFetching(true);
    setError('');

    try {
      const nextAssets = await getAdminPromptAssets({
        slot: slotFilter,
        limit: 1000
      });
      setAssets(nextAssets);
      const selectedStillExists = nextAssets.some(
        (asset) => asset.id === selectedId
      );
      const nextSelected = selectedStillExists
        ? nextAssets.find((asset) => asset.id === selectedId) || null
        : nextAssets[0] || null;
      setSelectedId(nextSelected?.id || null);
      setEditor(nextSelected ? toEditable(nextSelected) : null);
      setStatusText(`已加载 ${nextAssets.length} 个素材`);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : '素材库加载失败。'
      );
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, slotFilter]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return assets;
    return assets.filter((asset) =>
      [
        asset.id,
        asset.title,
        asset.subtitle,
        asset.prompt,
        asset.slot,
        ...(asset.tags || [])
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [assets, query]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) || null,
    [assets, selectedId]
  );

  const updateEditor = <K extends keyof EditablePromptAsset>(
    key: K,
    value: EditablePromptAsset[K]
  ) => {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  };

  const replaceAsset = (asset: AdminPromptAsset) => {
    setAssets((current) =>
      current.map((item) => (item.id === asset.id ? asset : item))
    );
    setSelectedId(asset.id);
    setEditor(toEditable(asset));
  };

  const handleSelectAsset = (asset: AdminPromptAsset) => {
    setSelectedId(asset.id);
    setEditor(toEditable(asset));
    setStatusText('');
    setError('');
  };

  const handleSave = async () => {
    if (!editor) return;

    setIsSaving(true);
    setError('');

    try {
      const baseMetadata = parseJsonObject(editor.metadataText, 'metadata');
      const promptZhTrimmed = editor.promptZhText.trim();
      const negativePromptZhTrimmed = editor.negativePromptZhText.trim();
      const mergedMetadata: Record<string, unknown> = { ...baseMetadata };
      if (promptZhTrimmed) {
        mergedMetadata.promptZh = promptZhTrimmed;
      } else {
        delete mergedMetadata.promptZh;
      }
      if (negativePromptZhTrimmed) {
        mergedMetadata.negativePromptZh = negativePromptZhTrimmed;
      } else {
        delete mergedMetadata.negativePromptZh;
      }

      const saved = await saveAdminPromptAsset({
        id: editor.id,
        slot: editor.slot,
        title: editor.title,
        subtitle: editor.subtitle,
        prompt: editor.prompt,
        negativePrompt: editor.negativePrompt || null,
        tags: editor.tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        thumbnailUrl: editor.thumbnailUrl,
        sourceBatchId: editor.sourceBatchId || null,
        provider: editor.provider || 'operator',
        visual: parseJsonObject(editor.visualText, 'visual'),
        metadata: mergedMetadata,
        sortOrder: Number(editor.sortOrder || 0),
        isPublished: editor.isPublished
      });
      replaceAsset(saved);
      setStatusText('素材已保存');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '素材保存失败。'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!editor) return;

    if (editor.isPublished) {
      setIsSaving(true);
      setError('');
      try {
        const updated = await unpublishAdminPromptAsset(editor.id);
        replaceAsset(updated);
        setStatusText('素材已下架');
      } catch (unpublishError) {
        setError(
          unpublishError instanceof Error
            ? unpublishError.message
            : '素材下架失败。'
        );
      } finally {
        setIsSaving(false);
      }
      return;
    }

    updateEditor('isPublished', true);
  };

  return (
    <div className="image-create-page prompt-ops-page">
      <TopNav />

      <main className="image-create-shell prompt-ops-shell">
        <section className="creator-intro">
          <div>
            <p className="creator-kicker">Prompt Asset Ops</p>
            <h1>运营素材库</h1>
          </div>
          <p>
            维护前台创作页使用的提示词、素材图、标签、排序和发布状态。权限由
            ADMIN_EMAILS 白名单控制。
          </p>
        </section>

        <section className="prompt-ops-workbench">
          <aside className="creator-panel prompt-ops-list">
            <div className="creator-panel-head">
              <span>素材列表</span>
              <strong>{filteredAssets.length}</strong>
            </div>

            <div className="prompt-ops-toolbar">
              <div className="creator-select">
                <Select
                  value={slotFilter}
                  onValueChange={(value) => setSlotFilter(value as SlotFilter)}
                >
                  <SelectTrigger
                    className="prompt-ops-select-trigger"
                    aria-label="筛选素材位置"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">全部位置</SelectItem>
                      {imagePromptSlots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void loadAssets()}
                aria-label="刷新素材列表"
              >
                {isFetching ? (
                  <Loader2 className="spin" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
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
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={asset.id === selectedId ? 'active' : ''}
                  onClick={() => handleSelectAsset(asset)}
                >
                  <img src={asset.thumbnailUrl} alt="" loading="lazy" />
                  <span>
                    <strong>{asset.title}</strong>
                    <small>
                      {asset.slot} · {asset.isPublished ? '已发布' : '未发布'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="creator-panel prompt-ops-editor">
            <div className="creator-panel-head">
              <span>编辑素材</span>
              <div className="creator-library-status">
                {statusText && <small>{statusText}</small>}
                {selectedAsset && (
                  <strong>{selectedAsset.isPublished ? 'ON' : 'OFF'}</strong>
                )}
              </div>
            </div>

            {editor ? (
              <>
                <div className="prompt-ops-preview">
                  <img src={editor.thumbnailUrl} alt="" />
                  <div>
                    <strong>{editor.id}</strong>
                    <small>{editor.updatedAt || editor.createdAt || '-'}</small>
                  </div>
                </div>

                <div className="prompt-ops-form-grid">
                  <Field className="prompt-ops-field">
                    <FieldLabel>位置</FieldLabel>
                    <Select
                      value={editor.slot}
                      onValueChange={(value) =>
                        updateEditor(
                          'slot',
                          value as AdminPromptAsset['slot']
                        )
                      }
                    >
                      <SelectTrigger className="prompt-ops-select-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {imagePromptSlots.map((slot) => (
                            <SelectItem key={slot.id} value={slot.id}>
                              {slot.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field className="prompt-ops-field">
                    <FieldLabel>排序</FieldLabel>
                    <Input
                      type="number"
                      value={editor.sortOrder || 0}
                      onChange={(event) =>
                        updateEditor('sortOrder', Number(event.target.value))
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field">
                    <FieldLabel>标题</FieldLabel>
                    <Input
                      value={editor.title}
                      onChange={(event) =>
                        updateEditor('title', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field">
                    <FieldLabel>副标题</FieldLabel>
                    <Input
                      value={editor.subtitle}
                      onChange={(event) =>
                        updateEditor('subtitle', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>缩略图 URL</FieldLabel>
                    <Input
                      value={editor.thumbnailUrl}
                      onChange={(event) =>
                        updateEditor('thumbnailUrl', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>标签，逗号分隔</FieldLabel>
                    <Input
                      value={editor.tagsText}
                      onChange={(event) =>
                        updateEditor('tagsText', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>Prompt（英文，喂模型）</FieldLabel>
                    <Textarea
                      value={editor.prompt}
                      onChange={(event) =>
                        updateEditor('prompt', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>Prompt（中文，前端中文界面展示）</FieldLabel>
                    <Textarea
                      value={editor.promptZhText}
                      placeholder="留空则前端按 id 兜底到本地默认翻译；写入后存到 metadata.promptZh"
                      onChange={(event) =>
                        updateEditor('promptZhText', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>Negative Prompt（英文）</FieldLabel>
                    <Textarea
                      value={editor.negativePrompt || ''}
                      onChange={(event) =>
                        updateEditor('negativePrompt', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field wide">
                    <FieldLabel>Negative Prompt（中文）</FieldLabel>
                    <Textarea
                      value={editor.negativePromptZhText}
                      placeholder="留空则兜底本地翻译；写入后存到 metadata.negativePromptZh"
                      onChange={(event) =>
                        updateEditor('negativePromptZhText', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field">
                    <FieldLabel>Visual JSON</FieldLabel>
                    <Textarea
                      value={editor.visualText}
                      onChange={(event) =>
                        updateEditor('visualText', event.target.value)
                      }
                    />
                  </Field>

                  <Field className="prompt-ops-field">
                    <FieldLabel>Metadata JSON</FieldLabel>
                    <Textarea
                      value={editor.metadataText}
                      onChange={(event) =>
                        updateEditor('metadataText', event.target.value)
                      }
                    />
                  </Field>
                </div>

                {error && <p className="creator-error">{error}</p>}

                <div className="prompt-ops-actions">
                  <Button
                    type="button"
                    variant="outline"
                    className="secondary"
                    disabled={isSaving}
                    onClick={handleTogglePublish}
                  >
                    {editor.isPublished ? (
                      <EyeOff data-icon="inline-start" />
                    ) : (
                      <Eye data-icon="inline-start" />
                    )}
                    {editor.isPublished ? '下架' : '设为发布'}
                  </Button>
                  <Button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                  >
                    {isSaving ? (
                      <Loader2 className="spin" />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    保存
                  </Button>
                </div>
              </>
            ) : (
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
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
