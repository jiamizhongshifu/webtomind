import { useState } from 'react';
import { CharacterConsistencyPanel } from '../components/image-create/CharacterConsistencyPanel';
import { ReferenceImagePanel } from '../components/image-create/ReferenceImagePanel';
import type { ImageCharacterCard } from '@/shared/image-reference-types';
import '../styles/image-create.css';

export function ReferenceCharacterPanelsHarnessPage() {
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(
    []
  );
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [selectedCharacters, setSelectedCharacters] = useState<
    ImageCharacterCard[]
  >([]);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [loginRequests, setLoginRequests] = useState(0);

  return (
    <main
      className="image-create-page"
      data-harness="reference-character-panels"
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
        Reference And Character Panels
      </h1>
      <div
        style={{
          display: 'grid',
          maxWidth: 760,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16
        }}
      >
        <ReferenceImagePanel
          isAuthenticated={false}
          onRequireLogin={() => setLoginRequests((count) => count + 1)}
          selectedReferenceIds={selectedReferenceIds}
          onSelectedReferenceIdsChange={setSelectedReferenceIds}
          setError={setError}
          setStatusText={setStatusText}
        />
        <CharacterConsistencyPanel
          isAuthenticated={false}
          onRequireLogin={() => setLoginRequests((count) => count + 1)}
          selectedReferenceIds={selectedReferenceIds}
          selectedCharacterIds={selectedCharacterIds}
          onSelectedReferenceIdsChange={setSelectedReferenceIds}
          onSelectedCharacterIdsChange={setSelectedCharacterIds}
          onSelectedCharactersChange={setSelectedCharacters}
          setError={setError}
          setStatusText={setStatusText}
        />
      </div>
      <pre
        data-testid="reference-character-state"
        style={{
          maxWidth: 760,
          marginTop: 16,
          whiteSpace: 'pre-wrap',
          fontSize: 12
        }}
      >
        {JSON.stringify(
          {
            selectedReferenceIds,
            selectedCharacterIds,
            selectedCharacters: selectedCharacters.map((item) => item.id),
            statusText,
            error,
            loginRequests
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}
