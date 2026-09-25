/**
 * NotebookLM Integration Types
 * Type definitions for task queue, outputs, and API communication
 */

// Source Types
export type SourceType = 'url' | 'youtube' | 'pdf' | 'text';
export type OutputType = 'flashcards' | 'mindmap' | 'report' | 'quiz' | 'summary' | 'audio' | 'video' | 'infographic' | 'slide_deck' | 'data_table';
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Task Input
export interface SourceInput {
  type: SourceType;
  content: string;
  fileName?: string;
}

export interface ProcessOptions {
  language?: 'zh-CN' | 'en-US';
  maxItems?: number;
}

// Task Definition
export interface NotebookLMTask {
  id: string;
  userId: string;
  source: SourceInput;
  outputType: OutputType;
  options: ProcessOptions;
  createdAt: Date;
  priority: number;
}

// Task Status
export interface TaskStatusInfo {
  status: TaskStatus;
  position?: number;
  progress?: number;
  result?: NotebookLMOutput;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// Output Types
export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
}

export interface FlashcardsOutput {
  type: 'flashcards';
  cards: Flashcard[];
  sourceTitle: string;
  generatedAt: string;
}

export interface MindmapNode {
  id: string;
  text: string;
  children?: MindmapNode[];
}

export interface MindmapOutput {
  type: 'mindmap';
  root: MindmapNode;
  sourceTitle: string;
  generatedAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface QuizOutput {
  type: 'quiz';
  questions: QuizQuestion[];
  sourceTitle: string;
  generatedAt: string;
}

export interface ReportSection {
  heading: string;
  content: string;
}

export interface ReportOutput {
  type: 'report';
  title: string;
  sections: ReportSection[];
  keyPoints: string[];
  sourceTitle: string;
  generatedAt: string;
}

export interface SummaryOutput {
  type: 'summary';
  title: string;
  summary: string;
  keyPoints: string[];
  sourceTitle: string;
  generatedAt: string;
}

// New Output Types (NotebookLM Studio)
export interface AudioOutput {
  type: 'audio';
  audioUrl: string;  // Base64 data URL or file path
  duration?: number; // Duration in seconds
  format: string;    // 'wav' or 'mp3'
  sourceTitle: string;
  generatedAt: string;
}

export interface VideoOutput {
  type: 'video';
  videoUrl: string;  // Base64 data URL or file path
  duration?: number;
  format: string;    // 'mp4' or 'webm'
  sourceTitle: string;
  generatedAt: string;
}

export interface InfographicOutput {
  type: 'infographic';
  imageUrl: string;  // Base64 data URL or file path
  format: string;    // 'png' or 'svg'
  sourceTitle: string;
  generatedAt: string;
}

export interface SlideDeckOutput {
  type: 'slide_deck';
  fileUrl: string;   // Base64 data URL or file path
  format: string;    // 'pptx' or 'pdf'
  slideCount?: number;
  sourceTitle: string;
  generatedAt: string;
}

export interface DataTableOutput {
  type: 'data_table';
  fileUrl: string;   // Base64 data URL or file path
  format: string;    // 'csv' or 'xlsx'
  rowCount?: number;
  columnCount?: number;
  sourceTitle: string;
  generatedAt: string;
}

export type NotebookLMOutput =
  | FlashcardsOutput
  | MindmapOutput
  | QuizOutput
  | ReportOutput
  | SummaryOutput
  | AudioOutput
  | VideoOutput
  | InfographicOutput
  | SlideDeckOutput
  | DataTableOutput;

// Error Types
export interface NotebookLMError {
  code: string;
  message: string;
  details?: string;
  traceId: string;
  retryable: boolean;
  retryAfter?: number;
}

// Queue Statistics
export interface QueueStats {
  totalTasks: number;
  queuedTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
}

// Worker Communication
export interface WorkerProcessRequest {
  task_id: string;
  source_type: SourceType;
  source_content: string;
  output_type: OutputType;
  options?: ProcessOptions;
}

export interface WorkerProcessResponse {
  task_id: string;
  status: 'processing' | 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
  trace_id: string;
  processing_time_seconds?: number;
}

export interface WorkerAccountInfo {
  id: string;
  source: string;
  email?: string;
  valid: boolean;
  uses: number;
  error?: string;
}

export interface WorkerProviderStatus {
  total: number;
  valid: number;
  db_loaded: boolean;
  accounts: WorkerAccountInfo[];
}

export interface WorkerProcessorStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_processing_time: number;
  avg_processing_time: number;
}

export interface WorkerProcessorStatus {
  validated: boolean;
  provider: WorkerProviderStatus;
  stats: WorkerProcessorStats;
  config: {
    default_timeout: number;
  };
}

export interface WorkerHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  notebooklm_available: boolean;
  accounts_available: number;
  processor?: WorkerProcessorStatus;
}
