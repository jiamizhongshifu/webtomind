import { useState } from 'react';
import type { Shortcut } from '@/services/database';
import { Button } from '@/shared/ui/radix/button';
import { ShortcutList } from '@/workspace/components/ShortcutList';

const initialShortcuts: Shortcut[] = [
  {
    id: 'shortcut-1',
    name: '研究材料整理',
    prompt: '请整理核心观点、关键证据和后续动作。',
    description: '默认研究整理技能',
    references: [],
    createdAt: Date.now() - 7200,
    updatedAt: Date.now() - 3600,
    order: 0
  },
  {
    id: 'shortcut-2',
    name: '生成小红书标题',
    prompt: '根据内容生成 10 个不同风格的标题。',
    description: '标题发散',
    references: [],
    createdAt: Date.now() - 3600,
    updatedAt: Date.now(),
    order: 1
  }
];

export function ShortcutListHarnessPage() {
  const [shortcuts, setShortcuts] = useState(initialShortcuts);
  const [selectedId, setSelectedId] = useState<string | null>('shortcut-1');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('ready');

  return (
    <main
      data-harness="shortcut-list"
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#141414',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      }}
    >
      <div style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>
          Shortcut List
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
          Status: <span data-testid="harness-status">{status}</span>
        </p>
      </div>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 280px))',
          gap: 24,
          padding: '0 24px 24px'
        }}
      >
        <div
          style={{
            height: 460,
            background: '#f8fafc',
            border: '1px solid #e5e7eb'
          }}
        >
          <ShortcutList
            shortcuts={shortcuts}
            selectedId={selectedId}
            loading={loading}
            onSelect={(id) => {
              setSelectedId(id);
              setStatus(`selected:${id}`);
            }}
            onCreate={() => {
              const nextShortcut: Shortcut = {
                id: `shortcut-${shortcuts.length + 1}`,
                name: `新建技能 ${shortcuts.length + 1}`,
                prompt: '新的技能提示词',
                description: '',
                references: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                order: shortcuts.length
              };
              setShortcuts((prev) => [...prev, nextShortcut]);
              setSelectedId(nextShortcut.id);
              setStatus('created');
            }}
            onReorder={(ids) => {
              setShortcuts((prev) =>
                ids
                  .map((id) => prev.find((shortcut) => shortcut.id === id))
                  .filter((shortcut): shortcut is Shortcut => Boolean(shortcut))
                  .map((shortcut, index) => ({ ...shortcut, order: index }))
              );
              setStatus(`reordered:${ids.join(',')}`);
            }}
          />
        </div>

        <div
          style={{
            height: 460,
            background: '#f8fafc',
            border: '1px solid #e5e7eb'
          }}
        >
          <ShortcutList
            shortcuts={[]}
            selectedId={null}
            loading={loading}
            onSelect={() => undefined}
            onCreate={() => setStatus('empty:create')}
            onReorder={() => undefined}
          />
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, padding: '0 24px 24px' }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLoading((value) => !value)}
        >
          Toggle loading
        </Button>
        <Button type="button" variant="outline" onClick={() => setShortcuts([])}>
          Clear primary list
        </Button>
      </div>
    </main>
  );
}
