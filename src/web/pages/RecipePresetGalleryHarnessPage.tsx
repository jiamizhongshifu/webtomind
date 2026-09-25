import { useState } from 'react';
import {
  defaultImagePromptSelection,
  type ImagePromptAsset
} from '../data/image-prompt-core';
import { RecipePresetGallery } from '../components/image-create/RecipePresetGallery';
import type { ImageStudioStarterCase } from '../components/image-create/useImageStudioStarterCases';
import '../styles/image-create.css';

const thumbnail =
  'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"%3E%3Cdefs%3E%3ClinearGradient id="g" x2="1" y2="1"%3E%3Cstop stop-color="%23dcc8a6"/%3E%3Cstop offset="1" stop-color="%23845d43"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="480" height="640" fill="url(%23g)"/%3E%3Ccircle cx="260" cy="220" r="112" fill="%23f3e5d2" fill-opacity=".72"/%3E%3Cpath d="M75 610c38-198 310-205 350 0" fill="%2347332a" fill-opacity=".76"/%3E%3C/svg%3E';

const styleAsset: ImagePromptAsset = {
  id: 'harness-warm-editorial',
  slot: 'style',
  title: '暖调编辑感',
  subtitle: '自然肌理与柔和对比',
  prompt: 'warm editorial photography, tactile natural texture',
  tags: ['editorial'],
  thumbnailUrl: thumbnail,
  visual: { tone: '#dcc8a6', accent: '#845d43', shape: 'style' }
};

const recipes: ImageStudioStarterCase[] = [
  {
    id: 'harness-editorial',
    sourceCaseId: 'harness-public-editorial',
    title: '暖调编辑人像',
    subtitle: '人物 · 柔光 · 胶片肌理',
    prompt:
      '暖调编辑人像，自然窗光，克制的胶片颗粒，真实皮肤肌理，安静而有张力的构图',
    selection: { ...defaultImagePromptSelection, style: styleAsset.id },
    imageUrls: [thumbnail]
  },
  {
    id: 'harness-cinematic',
    sourceCaseId: 'harness-public-cinematic',
    title: '城市电影切片',
    subtitle: '环境 · 叙事 · 低饱和',
    prompt:
      '城市电影切片，低饱和冷暖关系，环境叙事，35mm 纪实镜头，保留空气与偶然细节',
    selection: { ...defaultImagePromptSelection, style: styleAsset.id },
    imageUrls: [thumbnail]
  }
];

export function RecipePresetGalleryHarnessPage() {
  const [draft, setDraft] = useState('保留中的用户草稿');
  const [preview, setPreview] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);

  return (
    <main
      data-harness="recipe-preset-gallery"
      style={{
        minHeight: '100dvh',
        padding: 24,
        background: '#f6f3ee',
        color: '#141414',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
        ISOLATED PREVIEW HARNESS
      </p>
      <h1 style={{ margin: '8px 0 6px', fontSize: 24 }}>Visual recipes</h1>
      <p style={{ maxWidth: 680, margin: '0 0 24px', lineHeight: 1.6 }}>
        覆盖草稿、悬停临时预览、离开恢复和点击提交四种状态。触屏设备直接轻触提交。
      </p>
      <label style={{ display: 'grid', maxWidth: 720, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>当前提示词</span>
        <textarea
          value={preview ?? draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          style={{ padding: 14, borderRadius: 14, border: '1px solid #c9c0b4' }}
        />
      </label>
      <div style={{ maxWidth: 1040, marginTop: 28 }}>
        <RecipePresetGallery
          cases={recipes}
          onPreview={setPreview}
          onCommit={(recipe) => {
            setDraft(recipe.prompt);
            setPreview(null);
            setCommitted(recipe.id);
          }}
        />
      </div>
      <output
        data-testid="recipe-harness-state"
        style={{ display: 'block', marginTop: 20, fontSize: 12 }}
      >
        {committed ? `已提交：${committed}` : '尚未提交配方'}
      </output>
    </main>
  );
}
