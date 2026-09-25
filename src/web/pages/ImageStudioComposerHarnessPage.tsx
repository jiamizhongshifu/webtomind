import { useEffect, useState } from 'react';
import { ImageStudioComposer } from '../components/image-create/ImageStudioComposer';
import {
  defaultImagePromptSelection,
  defaultImagePromptSettings,
  toggleImagePromptAssetSelection,
  type ImagePromptAsset
} from '../data/image-prompt-core';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/create-studio-theme.css';

const LONG_PROMPT =
  '主体：一匹白马站在清晨薄雾中的草地上。场景：远处树影被雾气柔化，草叶带着露水。光影：自然逆光，克制的高光与柔和阴影。视觉风格：写实摄影，清透、安静、细节自然。镜头：中景，视线高度，轻微长焦压缩。'.repeat(
    4
  );
const REFERENCE_PREVIEW =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#446552"/><stop offset="1" stop-color="#c39768"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="160" cy="118" r="54" fill="rgba(255,255,255,.35)"/><path d="M62 300c18-82 69-124 98-124s80 42 98 124" fill="rgba(255,255,255,.25)"/></svg>'
  );
const HARNESS_RECIPE_ASSET: ImagePromptAsset = {
  id: 'harness-editorial-character',
  slot: 'character',
  title: '精致时装模特',
  subtitle: '成年商业成片主体',
  prompt: 'adult editorial fashion model with a distinct reusable identity',
  promptZh: '明确成年的精致时装模特，具有稳定且可复用的人物身份',
  tags: ['portrait'],
  visual: { tone: '#615248', accent: '#ead8c9', shape: 'portrait' },
  thumbnailUrl: REFERENCE_PREVIEW
};

export function ImageStudioComposerHarnessPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const isDark = searchParams.get('theme') === 'dark';
  const estimatedUnitCost = Math.max(
    1,
    Number(searchParams.get('unitCost')) || 120
  );
  const [prompt, setPrompt] = useState(LONG_PROMPT);
  const [settings, setSettings] = useState({
    ...defaultImagePromptSettings,
    imageSize: '2048x2048'
  });
  const [recipeSelection, setRecipeSelection] = useState(
    defaultImagePromptSelection
  );
  const [lastAction, setLastAction] = useState('ready');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    return () => document.documentElement.classList.remove('dark');
  }, [isDark]);

  return (
    <main
      className={`image-create-page image-studio-v2${isDark ? ' dark' : ''}`}
      data-harness="image-studio-composer"
      style={{
        minHeight: '100dvh',
        padding: '40px 20px 220px',
        background: isDark ? '#101010' : '#f6f7f9',
        color: isDark ? '#f5f5f5' : '#171a20'
      }}
    >
      <section style={{ width: 'min(900px, 100%)', margin: '0 auto' }}>
        <small style={{ color: isDark ? 'rgba(255,255,255,.45)' : '#7b8491' }}>
          IMAGE COMPOSER · LONG PROMPT
        </small>
        <h1 style={{ margin: '8px 0 20px' }}>输入框高度与编辑验证</h1>
        <button type="button" onClick={() => setPrompt('')}>
          清空提示词
        </button>
        <output style={{ display: 'block', marginTop: 12 }}>
          {prompt.length} characters · {lastAction}
        </output>
      </section>

      <ImageStudioComposer
        prompt={prompt}
        onPromptChange={setPrompt}
        settings={settings}
        onSettingsChange={setSettings}
        conditioningMode="none"
        boards={[]}
        activeMoodboard={null}
        onSelectMoodboard={() => undefined}
        onClearMoodboard={() => undefined}
        onCreateMoodboard={() => undefined}
        recipeSlots={[
          { id: 'character', label: '人设', group: '人物' as const }
        ]}
        assets={[HARNESS_RECIPE_ASSET]}
        selection={recipeSelection}
        recipeOpenSignal={searchParams.get('recipe') === '1' ? 1 : 0}
        requestedRecipeSlot="character"
        onRandomizeRecipe={() => undefined}
        onRandomizeSlot={() => undefined}
        onToggleRecipeAsset={(asset) =>
          setRecipeSelection((current) =>
            toggleImagePromptAssetSelection(current, asset)
          )
        }
        onClearRecipe={() => setRecipeSelection(defaultImagePromptSelection)}
        onApplyRecipe={() => {
          setPrompt(
            '主体人设：明确成年的精致时装模特，具有稳定且可复用的人物身份。'
          );
          setLastAction('recipe-applied');
          return true;
        }}
        referenceUploadItems={[
          {
            clientId: 'harness-upload',
            fileName: 'uploading-reference.webp',
            previewUrl: '',
            status: 'uploading'
          }
        ]}
        referenceMentions={[
          {
            id: 'reference-one',
            token: 'image1',
            label: '图片 1',
            detail: '人物参考图',
            previewUrl: REFERENCE_PREVIEW,
            kind: 'image'
          }
        ]}
        selectedReferenceCount={1}
        selectedCharacterCount={0}
        onMentionReference={(mention) =>
          setPrompt((current) =>
            current.includes(`@${mention.token}`)
              ? current
              : `${current.trimEnd()}\n@${mention.token} `
          )
        }
        onRemoveReference={() => setLastAction('reference-removed')}
        onOpenReferenceUpload={() => undefined}
        onPasteReferenceImages={(files) =>
          setLastAction(`pasted-${files.length}-reference-image`)
        }
        onOpenHistoryReferencePicker={() => undefined}
        onOpenCharacterWorkflow={() => undefined}
        autoOptimizePrompt={false}
        onAutoOptimizePromptChange={() => undefined}
        promptLibrary={[]}
        onApplyPromptLibraryItem={() => false}
        onSavePrompt={() => undefined}
        onReset={() => setPrompt('')}
        onImageCountChange={(imageCount) =>
          setSettings((current) => ({ ...current, imageCount }))
        }
        onGenerate={() => setLastAction('generate')}
        firstCreationMode={searchParams.get('first') === '1'}
        estimatedCost={estimatedUnitCost * settings.imageCount}
        estimatedUnitCost={estimatedUnitCost}
      />
    </main>
  );
}
