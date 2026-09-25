import { useEffect, useState } from 'react';
import {
  getCachedVisualImageUrlsByIds,
  getVisualImageHistoryByIds,
  getVisualVideoHistoryByIds
} from '@/services/agent-api';
import { listImageSessions } from '@/services/create-workspace-v2-api';
import type {
  CreationSessionMediaType,
  ImageCreationSession
} from '@/shared/create-workspace-v2';

const IMAGE_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

type ImageSessionCacheEntry = {
  sessions: ImageCreationSession[];
  loadedAt: number;
  inFlight?: Promise<ImageCreationSession[]>;
};

const imageSessionCache = new Map<string, ImageSessionCacheEntry>();

function updateImageSessionCacheEntries(
  ownerKey: string,
  updater: (sessions: ImageCreationSession[]) => ImageCreationSession[],
  mediaType?: CreationSessionMediaType
) {
  const ownerPrefix = mediaType ? `${ownerKey}:${mediaType}:` : `${ownerKey}:`;
  imageSessionCache.forEach((entry, key) => {
    if (!key.startsWith(ownerPrefix)) return;
    const limit = Number(key.slice(key.lastIndexOf(':') + 1));
    const sessions = updater(entry.sessions);
    imageSessionCache.set(key, {
      ...entry,
      sessions: Number.isFinite(limit) ? sessions.slice(0, limit) : sessions
    });
  });
}

export function upsertCachedImageCreationSession(
  ownerKey: string,
  session: ImageCreationSession
) {
  updateImageSessionCacheEntries(
    ownerKey,
    (sessions) => {
      const existingIndex = sessions.findIndex(
        (item) => item.id === session.id
      );
      if (existingIndex < 0) return [session, ...sessions];
      const next = [...sessions];
      next[existingIndex] = { ...next[existingIndex], ...session };
      return next;
    },
    session.mediaType || 'image'
  );
}

export function updateCachedImageCreationSessionCover(
  ownerKey: string,
  sessionId: string,
  cover: Pick<ImageCreationSession, 'coverGenerationId' | 'coverImageUrl'>
) {
  updateImageSessionCacheEntries(ownerKey, (sessions) =>
    sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            ...cover,
            updatedAt: new Date().toISOString()
          }
        : session
    )
  );
}

function getCreationSessionCacheKey(
  ownerKey: string,
  mediaType: CreationSessionMediaType,
  limit: number
) {
  return `${ownerKey}:${mediaType}:${limit}`;
}

function getCoverUrl(
  urls:
    | {
        imageUrl?: string;
        thumbnailUrl?: string;
        previewUrl?: string;
      }
    | undefined
) {
  return urls?.thumbnailUrl || urls?.previewUrl || urls?.imageUrl;
}

async function loadImageSessions(
  cacheKey: string,
  limit: number,
  force: boolean,
  mediaType: CreationSessionMediaType
): Promise<ImageCreationSession[]> {
  const requestStartedAt = Date.now();
  const cached = imageSessionCache.get(cacheKey);
  if (
    !force &&
    cached &&
    Date.now() - cached.loadedAt < IMAGE_SESSION_CACHE_TTL_MS
  ) {
    return cached.sessions;
  }
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = (async () => {
    const items =
      mediaType === 'image'
        ? await listImageSessions(limit)
        : await listImageSessions(limit, mediaType);
    const visibleSessions = items.slice(0, limit);
    const previousById = new Map(
      (cached?.sessions || []).map((session) => [session.id, session])
    );
    const coverIds = visibleSessions
      .map((session) => session.coverGenerationId)
      .filter((id): id is string => Boolean(id));
    const cachedUrlsById =
      mediaType === 'image' ? getCachedVisualImageUrlsByIds(coverIds) : {};
    const coverUrlById = new Map<string, string>();

    visibleSessions.forEach((session) => {
      if (!session.coverGenerationId) return;
      const previous = previousById.get(session.id);
      if (
        previous?.coverGenerationId === session.coverGenerationId &&
        previous.coverImageUrl
      ) {
        coverUrlById.set(session.coverGenerationId, previous.coverImageUrl);
        return;
      }
      const cachedCoverUrl = getCoverUrl(
        cachedUrlsById[session.coverGenerationId]
      );
      if (cachedCoverUrl) {
        coverUrlById.set(session.coverGenerationId, cachedCoverUrl);
      }
    });

    const unresolvedCoverIds = Array.from(new Set(coverIds)).filter(
      (id) => !coverUrlById.has(id)
    );
    if (unresolvedCoverIds.length > 0) {
      try {
        const { items: historyItems } =
          mediaType === 'video'
            ? await getVisualVideoHistoryByIds(unresolvedCoverIds)
            : await getVisualImageHistoryByIds(unresolvedCoverIds);
        historyItems.forEach((item) => {
          const coverUrl =
            'videoUrl' in item ? item.posterUrl : getCoverUrl(item);
          if (coverUrl) {
            coverUrlById.set(
              'generationId' in item ? item.generationId : item.id,
              coverUrl
            );
          }
        });
      } catch {
        // Session labels remain usable if cover hydration is unavailable.
      }
    }

    return visibleSessions.map((session) => {
      const previous = previousById.get(session.id);
      const coverGenerationId =
        session.coverGenerationId || previous?.coverGenerationId;
      return {
        ...session,
        coverGenerationId,
        coverImageUrl: coverGenerationId
          ? coverUrlById.get(coverGenerationId) || previous?.coverImageUrl
          : undefined
      };
    });
  })();

  imageSessionCache.set(cacheKey, {
    sessions: cached?.sessions || [],
    loadedAt: cached?.loadedAt || 0,
    inFlight
  });

  try {
    const sessions = await inFlight;
    const latestCachedSessions =
      imageSessionCache.get(cacheKey)?.sessions || [];
    const latestById = new Map(
      latestCachedSessions.map((session) => [session.id, session])
    );
    const serverIds = new Set(sessions.map((session) => session.id));
    const mergedSessions = sessions.map((session) => {
      const latest = latestById.get(session.id);
      const latestUpdatedAt = latest?.updatedAt
        ? Date.parse(latest.updatedAt)
        : 0;
      const serverUpdatedAt = session.updatedAt
        ? Date.parse(session.updatedAt)
        : 0;
      const keepLocallyUpdatedCover =
        Boolean(latest?.coverImageUrl) &&
        latestUpdatedAt >= requestStartedAt &&
        latestUpdatedAt >= serverUpdatedAt;
      return keepLocallyUpdatedCover
        ? {
            ...session,
            coverGenerationId: latest?.coverGenerationId,
            coverImageUrl: latest?.coverImageUrl,
            updatedAt: latest?.updatedAt || session.updatedAt
          }
        : session;
    });
    const locallyAddedSessions = latestCachedSessions.filter((session) => {
      if (serverIds.has(session.id)) return false;
      const updatedAt = session.updatedAt ? Date.parse(session.updatedAt) : 0;
      return updatedAt >= requestStartedAt;
    });
    const nextSessions = [...locallyAddedSessions, ...mergedSessions].slice(
      0,
      limit
    );
    imageSessionCache.set(cacheKey, {
      sessions: nextSessions,
      loadedAt: Date.now()
    });
    return nextSessions;
  } catch (error) {
    const latest = imageSessionCache.get(cacheKey);
    imageSessionCache.set(cacheKey, {
      sessions: latest?.sessions || cached?.sessions || [],
      loadedAt: latest?.loadedAt || cached?.loadedAt || 0
    });
    throw error;
  }
}

export function invalidateImageCreationSessionCache(ownerKey?: string) {
  if (!ownerKey) {
    imageSessionCache.clear();
    return;
  }
  const prefix = `${ownerKey}:`;
  Array.from(imageSessionCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) imageSessionCache.delete(key);
  });
}

export function useImageCreationSessions(
  enabled: boolean,
  limit = 6,
  ownerKey = 'authenticated-user',
  mediaType: CreationSessionMediaType = 'image'
) {
  const cacheKey = getCreationSessionCacheKey(ownerKey, mediaType, limit);
  const [state, setState] = useState<{
    cacheKey: string;
    sessions: ImageCreationSession[];
  }>(() => ({
    cacheKey,
    sessions: enabled ? imageSessionCache.get(cacheKey)?.sessions || [] : []
  }));

  useEffect(() => {
    if (!enabled) {
      setState({ cacheKey, sessions: [] });
      return;
    }
    let cancelled = false;
    const cachedSessions = imageSessionCache.get(cacheKey)?.sessions || [];
    setState({ cacheKey, sessions: cachedSessions });

    const load = (force = false) => {
      void loadImageSessions(cacheKey, limit, force, mediaType)
        .then((sessions) => {
          if (!cancelled) setState({ cacheKey, sessions });
        })
        .catch(() => {
          // Keep the already cached session list on transient request failures.
        });
    };
    load();
    const handleSessionChanged = (event: Event) => {
      setState({
        cacheKey,
        sessions: imageSessionCache.get(cacheKey)?.sessions || []
      });
      const shouldRefresh =
        !(event instanceof CustomEvent) || event.detail?.refresh !== false;
      if (shouldRefresh) load(true);
    };
    window.addEventListener('image-session-changed', handleSessionChanged);
    window.addEventListener('creation-session-changed', handleSessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('image-session-changed', handleSessionChanged);
      window.removeEventListener(
        'creation-session-changed',
        handleSessionChanged
      );
    };
  }, [cacheKey, enabled, limit, mediaType]);

  if (!enabled) return [];
  return state.cacheKey === cacheKey
    ? state.sessions
    : imageSessionCache.get(cacheKey)?.sessions || [];
}
