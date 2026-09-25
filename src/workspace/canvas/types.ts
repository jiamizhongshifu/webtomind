/*
 * Adapted from basketikun/infinite-canvas.
 * Source: https://github.com/basketikun/infinite-canvas
 * License: GNU Affero General Public License v3.0.
 */

export type Position = {
  x: number;
  y: number;
};

export type ViewportTransform = {
  x: number;
  y: number;
  k: number;
};

export type CanvasNodeSize = {
  width: number;
  height: number;
};

export enum CanvasNodeType {
  Image = 'image',
  Text = 'text',
  Config = 'config',
  Video = 'video',
  Audio = 'audio'
}

export type CanvasNodeStatus = 'idle' | 'success' | 'loading' | 'error';

export type CanvasNodeMetadata = {
  content?: string;
  prompt?: string;
  status?: CanvasNodeStatus;
  sourceSummaryId?: string;
  imageUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type CanvasNodeData = {
  id: string;
  type: CanvasNodeType;
  title: string;
  position: Position;
  width: number;
  height: number;
  metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
};

export type CanvasCustomNodeType = 'ai_image_holder' | 'annotation';

export type CanvasAnnotationKind =
  | 'note'
  | 'arrow_text'
  | 'box_text'
  | 'circle_text'
  | 'draw_mark'
  | 'text_near_image';

export type CanvasCustomNode = {
  id: string;
  type: CanvasCustomNodeType;
  title: string;
  content?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  aspectRatio?: string;
  aspectPreset?: string;
  aspectLocked?: boolean;
  annotationKind?: CanvasAnnotationKind;
  targetNodeId?: string;
  versionOfNodeId?: string;
  version?: number;
  output?: {
    imageUrl?: string;
    summaryId?: string;
    sourceSummaryId?: string;
    messageId?: string;
    mimeType?: string;
    title?: string;
    version?: number;
    savedAt?: number;
    targetWidth?: number;
    targetHeight?: number;
    aspectRatio?: string;
  };
  createdAt?: number;
};

export type CanvasProjectState = {
  nodeIds: string[];
  activeNodeIds: string[];
  customNodes: Record<string, CanvasCustomNode>;
  positions: Record<string, Position>;
  sizes: Record<string, CanvasNodeSize>;
  connections: CanvasConnection[];
  selectedNodeId?: string;
  viewport?: ViewportTransform;
  updatedAt?: number;
  recoveredRecordCount?: number;
};

export type ConnectionHandle = {
  nodeId: string;
  handleType: 'source' | 'target';
};
