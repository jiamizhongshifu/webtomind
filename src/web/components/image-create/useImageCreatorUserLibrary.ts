import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAuthToken,
  getImageCreatorUserLibrary,
  saveImageCreatorUserLibrary,
  type ImageCreatorUserLibraryPayload
} from '@/services/agent-api';

export function readOwnedCreatorCache(key: string, ownerId: string): unknown {
  try {
    // The legacy shared cache has no trustworthy owner. Never adopt it.
    window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(
      `${key}:v2:${encodeURIComponent(ownerId)}`
    );
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return cached?.ownerId === ownerId ? cached.items : null;
  } catch {
    return null;
  }
}

export function writeOwnedCreatorCache(
  key: string,
  ownerId: string,
  items: unknown
): void {
  try {
    window.localStorage.removeItem(key);
    window.localStorage.setItem(
      `${key}:v2:${encodeURIComponent(ownerId)}`,
      JSON.stringify({ ownerId, items })
    );
  } catch {
    // Local storage is optional; the remote library remains available.
  }
}

interface LibraryAdapter<T> {
  empty: T;
  read: (ownerId: string) => T;
  write: (ownerId: string, library: T) => void;
  merge: (local: T, remote: ImageCreatorUserLibraryPayload) => T;
  toPayload: (library: T) => ImageCreatorUserLibraryPayload;
}

/** Keep displayed data, local persistence and remote sync bound to one account. */
export function useImageCreatorUserLibrary<T>(
  ownerId: string | null,
  adapter: LibraryAdapter<T>
) {
  const token = getAuthToken();
  const [snapshot, setSnapshot] = useState(() => ({
    ownerId,
    library: ownerId ? adapter.read(ownerId) : adapter.empty
  }));
  const activeOwnerRef = useRef(ownerId);
  activeOwnerRef.current = ownerId;
  let library = snapshot.library;
  if (snapshot.ownerId !== ownerId) {
    // Reset before children commit: an account switch must not paint old items.
    library = ownerId ? adapter.read(ownerId) : adapter.empty;
    setSnapshot({ ownerId, library });
  }
  const libraryRef = useRef(library);
  libraryRef.current = library;

  useEffect(() => {
    if (!ownerId || ownerId === 'anonymous' || !token) return;
    let cancelled = false;
    void getImageCreatorUserLibrary()
      .then(async (remote) => {
        if (
          cancelled ||
          activeOwnerRef.current !== ownerId ||
          getAuthToken() !== token
        )
          return;
        const merged = adapter.merge(libraryRef.current, remote);
        libraryRef.current = merged;
        adapter.write(ownerId, merged);
        setSnapshot({ ownerId, library: merged });
        await saveImageCreatorUserLibrary(adapter.toPayload(merged));
      })
      .catch((error) => {
        if (!cancelled)
          console.warn(
            '[ImageCreate] user library initial sync failed:',
            error
          );
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, ownerId, token]);

  const saveLibrary = useCallback(
    (next: T) => {
      if (
        !ownerId ||
        activeOwnerRef.current !== ownerId ||
        getAuthToken() !== token
      )
        return;
      libraryRef.current = next;
      setSnapshot({ ownerId, library: next });
      adapter.write(ownerId, next);
      if (ownerId !== 'anonymous' && token) {
        void saveImageCreatorUserLibrary(adapter.toPayload(next)).catch(
          (error) => {
            console.warn('[ImageCreate] user library sync failed:', error);
          }
        );
      }
    },
    [adapter, ownerId, token]
  );

  return { library, saveLibrary };
}
