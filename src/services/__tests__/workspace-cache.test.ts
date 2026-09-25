import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedSummary } from '../database';

const dbMockState = vi.hoisted(() => {
  const workspaceCache = new Map<string, unknown>();
  const db = {
    init: vi.fn(async () => undefined),
    getWorkspaceCache: vi.fn(
      async (key: string) => workspaceCache.get(key) || null
    ),
    setWorkspaceCache: vi.fn(async (entry: { key: string }) => {
      workspaceCache.set(entry.key, entry);
    })
  };

  return {
    workspaceCache,
    db
  };
});

vi.mock('../database', () => ({
  DatabaseService: {
    getInstance: () => dbMockState.db
  }
}));

import {
  addSummaryToCache,
  clearProjectThumbnailsMemoryCache,
  getProjectThumbnails,
  setCurrentUserId,
  setProjectThumbnails
} from '../workspace-cache';

function makeSummary(
  id: string,
  createdAt: number,
  projectId = 'project-1'
): SavedSummary {
  return {
    id,
    userId: 'user-1',
    projectId,
    title: id,
    url: '',
    markdown: `# ${id}`,
    contentType: 'image',
    createdAt,
    updatedAt: createdAt,
    isSaving: false,
    metadata: {
      imageUrl: `https://example.com/${id}.webp`
    }
  } as SavedSummary;
}

describe('workspace project thumbnail cache', () => {
  beforeEach(() => {
    dbMockState.workspaceCache.clear();
    vi.clearAllMocks();
    setCurrentUserId('unit-user');
    clearProjectThumbnailsMemoryCache();
  });

  it('stores project thumbnails by createdAt desc and id asc', async () => {
    await setProjectThumbnails('project-1', [
      makeSummary('summary-b', 2000),
      makeSummary('summary-old', 1000),
      makeSummary('summary-c', 3000),
      makeSummary('summary-a', 2000)
    ]);

    const thumbnails = await getProjectThumbnails('project-1');

    expect(thumbnails?.map((summary) => summary.id)).toEqual([
      'summary-c',
      'summary-a',
      'summary-b'
    ]);
  });

  it('keeps newly added thumbnails visible without breaking same-time ordering', async () => {
    await setProjectThumbnails('project-1', [
      makeSummary('summary-b', 2000),
      makeSummary('summary-old', 1000)
    ]);

    await addSummaryToCache(makeSummary('summary-a', 2000));
    await addSummaryToCache(makeSummary('summary-c', 3000));

    const thumbnails = await getProjectThumbnails('project-1');

    expect(thumbnails?.map((summary) => summary.id)).toEqual([
      'summary-c',
      'summary-a',
      'summary-b'
    ]);
  });
});
