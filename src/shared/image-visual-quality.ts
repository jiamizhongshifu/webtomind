export const IMAGE_VISUAL_QUALITY_SCHEMA_VERSION = 1 as const;
export const IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION =
  'image-recipe-visual-v1' as const;

export const imageVisualQualityDimensions = [
  'prompt_coherence',
  'subject_scene_adherence',
  'wardrobe_material_adherence',
  'pose_expression_adherence',
  'framing_camera_adherence',
  'lighting_style_adherence',
  'technical_integrity'
] as const;

export type ImageVisualQualityDimension =
  (typeof imageVisualQualityDimensions)[number];

export const imageVisualQualityDimensionWeights: Record<
  ImageVisualQualityDimension,
  number
> = {
  prompt_coherence: 10,
  subject_scene_adherence: 20,
  wardrobe_material_adherence: 15,
  pose_expression_adherence: 15,
  framing_camera_adherence: 10,
  lighting_style_adherence: 10,
  technical_integrity: 20
};

export type ImageVisualQualityGrade =
  | 'excellent'
  | 'good'
  | 'needs_review'
  | 'poor';

export type ImageVisualQualitySeverity = 'critical' | 'major' | 'minor';

export interface ImageVisualQualityDimensionScore {
  applicable: boolean;
  score: number | null;
  evidence: string[];
}

export interface ImageVisualQualityFinding {
  dimension: ImageVisualQualityDimension;
  severity: ImageVisualQualitySeverity;
  evidence: string;
  suggestion: string;
}

export interface ImageVisualQualityAudit {
  schemaVersion: typeof IMAGE_VISUAL_QUALITY_SCHEMA_VERSION;
  evaluatorVersion: typeof IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION;
  evaluatedAt: string;
  model: string;
  overallScore: number;
  grade: ImageVisualQualityGrade;
  confidence: number;
  summary: string;
  dimensions: Record<
    ImageVisualQualityDimension,
    ImageVisualQualityDimensionScore
  >;
  findings: ImageVisualQualityFinding[];
  repairPrompt: string;
  assetIds: string[];
  recipeSelectionSource?: string;
  recipeCompilerVersion?: string;
}

export interface ImageVisualQualityAuditState {
  status: 'evaluating' | 'completed' | 'failed';
  evaluatorVersion: typeof IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION;
  attempts: number;
  updatedAt: string;
  leaseExpiresAt?: string;
  nextRetryAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateImageVisualQualityOverallScore(
  dimensions: Record<
    ImageVisualQualityDimension,
    ImageVisualQualityDimensionScore
  >
): number {
  let weightedScore = 0;
  let applicableWeight = 0;

  imageVisualQualityDimensions.forEach((dimension) => {
    const item = dimensions[dimension];
    if (!item.applicable || item.score === null) return;
    const weight = imageVisualQualityDimensionWeights[dimension];
    weightedScore += clampScore(item.score) * weight;
    applicableWeight += weight;
  });

  return applicableWeight > 0
    ? clampScore(weightedScore / applicableWeight)
    : 0;
}

export function getImageVisualQualityGrade(
  score: number
): ImageVisualQualityGrade {
  const normalized = clampScore(score);
  if (normalized >= 85) return 'excellent';
  if (normalized >= 75) return 'good';
  if (normalized >= 60) return 'needs_review';
  return 'poor';
}

export function isCurrentImageVisualQualityAudit(
  value: unknown
): value is ImageVisualQualityAudit {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Partial<ImageVisualQualityAudit>;
  return (
    audit.schemaVersion === IMAGE_VISUAL_QUALITY_SCHEMA_VERSION &&
    audit.evaluatorVersion === IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION &&
    typeof audit.overallScore === 'number' &&
    Boolean(audit.dimensions)
  );
}
