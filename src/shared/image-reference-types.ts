export type ImageReferenceRole =
  | 'character'
  | 'style'
  | 'pose'
  | 'scene'
  | 'product';

export type ImageReferenceMode =
  | 'none'
  | 'image_reference'
  | 'character_consistency';

export interface ImageReferenceAsset {
  id: string;
  role: ImageReferenceRole;
  label: string;
  description?: string;
  thumbnailUrl: string;
  thumbnailUrlExpiresIn?: number;
  storageBucket?: string;
  storagePath?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  createdAt?: string;
}

export interface SelectedImageReference {
  id: string;
  role: ImageReferenceRole;
  label: string;
  thumbnailUrl: string;
}

export interface ImageCharacterCardReference {
  id: string;
  role: ImageReferenceRole;
  label: string;
  thumbnailUrl: string;
}

export interface ImageCharacterCard {
  id: string;
  name: string;
  description?: string;
  lockedTraits?: string[];
  referenceImageIds: string[];
  references: ImageCharacterCardReference[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ImageCharacterReferenceGroup {
  characterCardId?: string;
  label: string;
  description?: string;
  referenceImageIds: string[];
}

export interface ImageConsistencyCheckResult {
  score: number;
  verdict: 'pass' | 'needs_repair' | 'unknown';
  matchedTraits: string[];
  driftedTraits: string[];
  repairPrompt: string;
  model?: string;
  usedFallback?: boolean;
}

export const IMAGE_REFERENCE_ROLES: ImageReferenceRole[] = [
  'character',
  'style',
  'pose',
  'scene',
  'product'
];

export const MAX_IMAGE_REFERENCE_IDS = 4;
export const MAX_CHARACTER_REFERENCE_GROUPS = 2;
export const MAX_CHARACTER_REFERENCES_PER_GROUP = 3;

export function mergeBillableImageReferenceIds(
  ...groups: ReadonlyArray<ReadonlyArray<string | undefined>>
): string[] {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((id) => id?.trim() || '')
        .filter(Boolean)
    )
  ).slice(0, MAX_IMAGE_REFERENCE_IDS);
}
