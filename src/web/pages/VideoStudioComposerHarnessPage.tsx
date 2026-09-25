import { useEffect, useState } from 'react';
import { VideoStudioComposer } from '../components/video-create/VideoStudioComposer';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/video-studio.css';
import '../styles/create-studio-theme.css';
import {
  SEEDANCE_VIDEO_MODELS,
  getSeedanceVideoModelConfig,
  type SeedanceVideoResolution
} from '@/shared/seedance-video-models';

function frameDataUrl(label: string, start: string, end: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="144" r="76" fill="rgba(255,255,255,.32)"/><path d="M180 292c22-78 91-116 140-116s118 38 140 116" fill="rgba(255,255,255,.22)"/><text x="32" y="328" fill="white" font-family="sans-serif" font-size="34" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const REFERENCE_IMAGE = frameDataUrl('REFERENCE', '#355d48', '#c69563');

export function VideoStudioComposerHarnessPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const harnessState = searchParams.get('state');
  const errorMessage =
    harnessState === 'reference-duration-error'
      ? '参考视频时长为 44.37 秒，允许范围为 2–15 秒；文件大小 84.9 MB 符合上限。请裁剪到 15 秒以内后重试。'
      : harnessState === 'error'
        ? '提示词优化服务暂时不可用：gemini_official 不支持当前服务区域；tuzi 请求在 12 秒后超时。'
        : '';
  const isDark = searchParams.get('theme') === 'dark';
  const estimatedCostPerSecond = Math.max(
    1,
    Number(searchParams.get('rate')) || 20
  );
  const model = getSeedanceVideoModelConfig('seedance-2-0-fast');
  const [prompt, setPrompt] = useState(
    '一位创作者站在机舱窗边，镜头保持固定，晨光从侧面掠过她的脸。'
  );
  const [referenceImageUrls, setReferenceImageUrls] = useState([
    REFERENCE_IMAGE
  ]);
  const [firstFrameUrl, setFirstFrameUrl] = useState('');
  const [lastFrameUrl, setLastFrameUrl] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(8);
  const [resolution, setResolution] = useState<SeedanceVideoResolution>('720p');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [status, setStatus] = useState('已引用图片1。');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    return () => document.documentElement.classList.remove('dark');
  }, [isDark]);

  const mentionFrame = (slot: 'first' | 'last') => {
    const token = slot === 'first' ? '@首帧' : '@尾帧';
    setPrompt((current) =>
      current.includes(token) ? current : `${current.trimEnd()}\n${token} `
    );
  };

  return (
    <main
      className={`image-create-page video-studio-v2${isDark ? ' dark' : ''}`}
      data-harness="video-studio-composer"
      style={{
        minHeight: '100dvh',
        padding: '40px 20px 300px',
        background: isDark ? '#101010' : '#f6f7f9',
        color: isDark ? '#f5f5f5' : '#171a20'
      }}
    >
      <section style={{ width: 'min(900px, 100%)', margin: '0 auto' }}>
        <small style={{ color: isDark ? 'rgba(255,255,255,.45)' : '#7b8491' }}>
          VIDEO COMPOSER · REFERENCED FRAMES
        </small>
        <h1 style={{ margin: '8px 0 12px' }}>输入框参考图与提示优化验证</h1>
        <p style={{ color: isDark ? 'rgba(255,255,255,.58)' : '#5f6876' }}>
          悬停缩略图检查 @ 与取消操作；缩窄视口检查触控按钮和工具栏。
        </p>
      </section>

      <VideoStudioComposer
        isEnglish={false}
        prompt={prompt}
        onPromptChange={setPrompt}
        model={model}
        models={SEEDANCE_VIDEO_MODELS}
        onModelChange={() => undefined}
        creationMode={
          firstFrameUrl || lastFrameUrl ? 'first-last-frame' : 'auto'
        }
        referenceImageUrls={referenceImageUrls}
        referenceVideoUrls={[]}
        referenceAudioUrls={[]}
        referenceUploading="video"
        onOpenReferenceGallery={() => undefined}
        onOpenReferenceUpload={() => undefined}
        onPasteReferenceImages={(files) =>
          setStatus(`已粘贴 ${files.length} 张参考图。`)
        }
        onMentionReference={(mediaType, index) => {
          const token =
            mediaType === 'image'
              ? `@图片${index + 1}`
              : mediaType === 'video'
                ? `@视频${index + 1}`
                : `@音频${index + 1}`;
          setPrompt((current) =>
            current.includes(token)
              ? current
              : `${current.trimEnd()}\n${token} `
          );
        }}
        onClearReference={(mediaType, index) => {
          if (mediaType === 'image') {
            setReferenceImageUrls((current) =>
              current.filter((_, currentIndex) => currentIndex !== index)
            );
          }
        }}
        firstFrameUrl={firstFrameUrl}
        lastFrameUrl={lastFrameUrl}
        frameUploadSlot={null}
        onOpenFrameGallery={() => undefined}
        onOpenFrameUpload={() => undefined}
        onMentionFrame={mentionFrame}
        onClearFrame={(slot) =>
          slot === 'first' ? setFirstFrameUrl('') : setLastFrameUrl('')
        }
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        duration={duration}
        onDurationChange={setDuration}
        resolution={resolution}
        onResolutionChange={setResolution}
        generateAudio={generateAudio}
        onGenerateAudioChange={setGenerateAudio}
        watermark={watermark}
        onWatermarkChange={setWatermark}
        webSearch={webSearch}
        onWebSearchChange={setWebSearch}
        quantity={quantity}
        onQuantityChange={setQuantity}
        autoOptimize={autoOptimize}
        onAutoOptimizeChange={setAutoOptimize}
        optimizingPrompt={optimizing}
        onOptimizePrompt={() => {
          setOptimizing(true);
          window.setTimeout(() => {
            setPrompt((current) => `${current.trim()}\n保持主体和光线连续。`);
            setStatus('提示词优化完成。');
            setOptimizing(false);
          }, 500);
        }}
        estimatedCost={estimatedCostPerSecond * duration * quantity}
        estimatedCostPerSecond={estimatedCostPerSecond}
        pendingTaskCount={0}
        submitting={false}
        availabilityLoading={false}
        available
        isAuthenticated
        authLoading={false}
        error={errorMessage || undefined}
        status={errorMessage ? '' : status}
        onRandomPrompt={() => setPrompt('固定机位，产品缓慢旋转。')}
        onGenerate={() => setStatus('已点击生成。')}
        onLogin={() => undefined}
      />
    </main>
  );
}
