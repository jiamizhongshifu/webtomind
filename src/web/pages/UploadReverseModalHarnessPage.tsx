import { useMemo, useState } from 'react';
import type { ImagePromptSlot } from '../data/image-prompt-core';
import {
  UploadReverseModal,
  type UploadDraftRow
} from '../components/image-create/UploadReverseModal';
import '../styles/image-create.css';

function makeHarnessThumbnail() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f8e7ca"/><stop offset=".58" stop-color="#d77b54"/><stop offset="1" stop-color="#201b18"/></linearGradient></defs><rect width="900" height="900" fill="url(#g)"/><circle cx="680" cy="210" r="138" fill="rgba(255,255,255,.22)"/><rect x="104" y="560" width="692" height="176" rx="38" fill="rgba(255,255,255,.16)"/><text x="132" y="646" fill="white" font-family="Arial, sans-serif" font-size="54" font-weight="700">Reverse Import</text><text x="136" y="704" fill="rgba(255,255,255,.76)" font-family="Arial, sans-serif" font-size="28">Modal harness sample</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const initialRows: UploadDraftRow[] = [
  {
    key: 'row-character',
    selected: true,
    slot: 'character',
    title: 'Warm editorial subject',
    subtitle: 'Soft confidence, clean facial hierarchy',
    prompt:
      'Young creative director, calm confident expression, warm studio light, natural face structure, polished editorial portrait.',
    negativePrompt: 'blur, low detail, distorted face, extra fingers',
    tagsText: 'portrait, editorial, warm-light'
  },
  {
    key: 'row-background',
    selected: false,
    slot: 'background',
    title: 'Sunset studio wall',
    subtitle: 'Warm textured background with gentle depth',
    prompt:
      'Minimal warm studio wall, subtle sunset gradient, soft shadows, quiet premium commercial atmosphere.',
    negativePrompt: 'busy background, logos, readable text',
    tagsText: 'studio, warm, minimal'
  }
];

const slotLabels: Record<ImagePromptSlot, string> = {
  character: 'Character',
  expression: 'Expression',
  hairstyle: 'Hairstyle',
  pose: 'Pose',
  top: 'Top',
  bottom: 'Bottom',
  outfit: 'Outfit',
  onePiece: 'One-piece',
  shoes: 'Shoes',
  background: 'Background',
  productSubject: 'Product subject',
  productSurface: 'Product surface',
  composition: 'Composition',
  titleArea: 'Title area',
  layoutDesign: 'Layout design',
  accessory: 'Accessory',
  prop: 'Prop',
  makeup: 'Makeup',
  shot: 'Shot',
  viewpoint: 'Viewpoint',
  lens: 'Lens',
  lighting: 'Lighting',
  style: 'Style',
  visualEffect: 'Visual effect'
};

export function UploadReverseModalHarnessPage() {
  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('ready');
  const thumbnailUrl = useMemo(() => makeHarnessThumbnail(), []);
  const slots = useMemo(
    () =>
      [
        { id: 'character' },
        { id: 'background' },
        { id: 'lighting' },
        { id: 'style' }
      ] satisfies ReadonlyArray<{ id: ImagePromptSlot }>,
    []
  );

  const updateRow = (key: string, patch: Partial<UploadDraftRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
    setStatus(`removed:${key}`);
  };

  const addRow = () => {
    const key = `row-extra-${rows.length + 1}`;
    setRows((current) => [
      ...current,
      {
        key,
        selected: true,
        slot: 'style',
        title: 'New style cue',
        subtitle: 'Reusable visual direction',
        prompt: 'Clean premium style cue with controlled contrast.',
        negativePrompt: 'messy texture, low quality',
        tagsText: 'style, reusable'
      }
    ]);
    setStatus(`added:${key}`);
  };

  const save = () => {
    setSaving(true);
    setStatus('saving');
    window.setTimeout(() => {
      setSaving(false);
      setStatus('saved');
    }, 700);
  };

  return (
    <main data-harness="upload-reverse-modal" style={{ minHeight: '100vh' }}>
      <div
        style={{
          padding: 24,
          color: '#141414',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
          Upload Reverse Modal
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
      </div>
      <UploadReverseModal
        thumbnailUrl={thumbnailUrl}
        sourcePrompt="Harness source prompt"
        rows={rows}
        saving={saving}
        error=""
        slots={slots}
        getSlotLabel={(slot) => slotLabels[slot]}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onAddRow={addRow}
        onCancel={() => setStatus('cancel')}
        onSave={save}
      />
    </main>
  );
}
