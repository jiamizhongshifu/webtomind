export const GENERATED_ASSET_STORAGE_BUCKET = 'user-generated-assets';

export type GeneratedAssetOutputFormat =
  | 'pptx'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'zip';

export type GeneratedAssetType =
  | 'presentation'
  | 'document'
  | 'spreadsheet'
  | 'archive'
  | 'other';

export type AssetGenerationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface GeneratedAssetRecord {
  id: string;
  taskId?: string | null;
  appSlug: string;
  assetType: GeneratedAssetType;
  title: string;
  prompt?: string | null;
  outputFormat: GeneratedAssetOutputFormat;
  mimeType?: string | null;
  storageBucket: string;
  storagePath?: string | null;
  downloadFilename?: string | null;
  byteSize?: number | null;
  status: 'ready' | 'deleted' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AssetGenerationRequest {
  appSlug: string;
  assetType: GeneratedAssetType;
  prompt: string;
  outputFormat: GeneratedAssetOutputFormat;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetGenerationAcceptedResponse {
  success: true;
  taskId: string;
  status: Extract<AssetGenerationStatus, 'queued' | 'running'>;
  pollUrl: string;
}

export interface AssetGenerationNotReadyResponse {
  success: false;
  error: 'FILE_ASSET_GENERATION_NOT_READY';
  message: string;
  appSlug?: string;
  supportedFormats: GeneratedAssetOutputFormat[];
  storageBucket: typeof GENERATED_ASSET_STORAGE_BUCKET;
}

export interface GeneratedAssetHistoryResponse {
  success: true;
  items: GeneratedAssetRecord[];
  nextBefore?: string;
  hasMore: boolean;
}

export interface GeneratedAssetDownloadNotReadyResponse {
  success: false;
  error: 'FILE_ASSET_DOWNLOAD_NOT_READY' | 'ASSET_ID_REQUIRED';
  message: string;
  assetId?: string;
  storageBucket: typeof GENERATED_ASSET_STORAGE_BUCKET;
}

export const GENERATED_ASSET_FORMAT_LABELS: Record<
  GeneratedAssetOutputFormat,
  string
> = {
  pptx: 'PPTX',
  pdf: 'PDF',
  docx: 'DOCX',
  xlsx: 'XLSX',
  zip: 'ZIP'
};

export const PPT_DECK_LAB_FORMATS: GeneratedAssetOutputFormat[] = ['pptx'];
