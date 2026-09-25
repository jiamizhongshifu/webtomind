import { useState } from 'react';
import type { ImagePromptSettings } from '../data/image-prompt-core';
import { modelOptions } from '../data/image-creator-options';
import { CreatorControls } from '../components/image-create/CreatorControls';
import '../styles/image-create.css';

const initialSettings: ImagePromptSettings = {
  model: modelOptions[0]?.value || '',
  imageSize: '1024x1024',
  aspectRatio: '1:1',
  quality: 'auto',
  outputFormat: 'png',
  imageCount: 1,
  customPrompt: ''
};

export function CreatorControlsHarnessPage() {
  const [settings, setSettings] = useState<ImagePromptSettings>(initialSettings);

  return (
    <main
      data-harness="creator-controls"
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
        Creator Controls
      </h1>
      <div style={{ maxWidth: 360 }}>
        <CreatorControls settings={settings} onSettingsChange={setSettings} />
      </div>
      <pre
        data-testid="creator-controls-state"
        style={{
          maxWidth: 360,
          marginTop: 16,
          whiteSpace: 'pre-wrap',
          fontSize: 12
        }}
      >
        {JSON.stringify(settings, null, 2)}
      </pre>
    </main>
  );
}
