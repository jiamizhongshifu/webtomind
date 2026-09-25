export const CREATE_WORKSPACE_FEATURE_FLAGS = {
  createShellV2: 'create_shell_v2',
  imageStudioV2: 'image_studio_v2',
  moodboardsV1: 'moodboards_v1',
  pricingWorkspaceV2: 'pricing_workspace_v2',
  visualSearchV1: 'visual_search_v1',
  activationJourneyV1: 'activation_journey_v1'
} as const;

export type CreateWorkspaceFeatureFlag =
  (typeof CREATE_WORKSPACE_FEATURE_FLAGS)[keyof typeof CREATE_WORKSPACE_FEATURE_FLAGS];

export type MoodboardVisibility = 'private' | 'unlisted' | 'public';
export type MoodboardAnalysisStatus =
  | 'idle'
  | 'analyzing'
  | 'ready'
  | 'stale'
  | 'failed';
export type MoodboardItemSource =
  | 'upload'
  | 'gallery'
  | 'generation'
  | 'prompt_case'
  | 'preset';

export interface MoodboardConditioning {
  moodboardId: string;
  shareToken?: string;
  analysisVersion: number;
  tasteProfile: string;
  keywords: string[];
  avoids: string[];
  guidelines: string[];
  representativeAssetIds: string[];
}

export interface ImageCreationContext {
  sessionId?: string;
  taskId?: string;
  recipeId?: string;
  moodboard?: MoodboardConditioning;
  conversionAttribution?: {
    sessionId: string;
    canonicalPath: string;
    caseId: string;
    caseSlug?: string;
    source: string;
    cluster?: string;
    contentId?: string;
    cta?: string;
    capturedAt: string;
  };
  referenceAssetIds: string[];
}

export interface VisualMoodboardItem {
  id: string;
  moodboardId: string;
  source: MoodboardItemSource;
  imageUrl: string;
  title?: string;
  prompt?: string;
  imageReferenceId?: string;
  mediaObjectId?: string;
  imageGenerationId?: string;
  promptCaseId?: string;
  sortOrder: number;
  isRepresentative: boolean;
  createdAt: string;
}

export interface VisualMoodboard {
  id: string;
  sourceMoodboardId?: string;
  sourcePresetKey?: string;
  name: string;
  description?: string;
  visibility: MoodboardVisibility;
  isOfficial: boolean;
  isOwner: boolean;
  coverImageUrl?: string;
  itemCount: number;
  items?: VisualMoodboardItem[];
  analysisStatus: MoodboardAnalysisStatus;
  tasteProfile: string;
  keywords: string[];
  avoids: string[];
  guidelines: string[];
  representativeAssetIds: string[];
  analysisVersion: number;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageCreationSession {
  id: string;
  title: string;
  mediaType?: 'image' | 'video';
  status: 'active' | 'archived';
  coverGenerationId?: string;
  coverImageUrl?: string;
  lastTurnAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageCreationTurn {
  id: string;
  sessionId: string;
  prompt: string;
  negativePrompt?: string;
  status: 'pending' | 'running' | 'partial' | 'succeeded' | 'failed';
  context: ImageCreationContext;
  generationIds: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreationSessionMediaType = 'image' | 'video';

export const MOODBOARD_MIN_ANALYSIS_ITEMS = 4;
export const MOODBOARD_RECOMMENDED_MIN_ITEMS = 4;
export const MOODBOARD_RECOMMENDED_MAX_ITEMS = 8;
export const MOODBOARD_MAX_ITEMS = 24;
export const MOODBOARD_MAX_REPRESENTATIVE_ITEMS = 4;

export function toMoodboardConditioning(
  moodboard: VisualMoodboard
): MoodboardConditioning | undefined {
  if (
    moodboard.analysisStatus !== 'ready' ||
    moodboard.analysisVersion < 1 ||
    !moodboard.tasteProfile.trim()
  ) {
    return undefined;
  }
  return {
    moodboardId: moodboard.id,
    ...(moodboard.shareToken ? { shareToken: moodboard.shareToken } : {}),
    analysisVersion: moodboard.analysisVersion,
    tasteProfile: moodboard.tasteProfile,
    keywords: moodboard.keywords,
    avoids: moodboard.avoids,
    guidelines: moodboard.guidelines,
    representativeAssetIds: moodboard.representativeAssetIds.slice(
      0,
      MOODBOARD_MAX_REPRESENTATIVE_ITEMS
    )
  };
}
