/**
 * NotebookLM 输出内容展示组件
 * 支持各种输出类型：测验、思维导图、报告、摘要、音频、视频、信息图、演示文稿、数据表格
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  RotateCcw,
  FileText,
  Brain,
  ListChecks,
  Download,
  Volume2,
  Video,
  Image as ImageIcon,
  Presentation,
  Table,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// ==================== 类型定义 ====================

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface MindmapNode {
  id: string;
  text: string;
  children?: MindmapNode[];
}

export interface ReportSection {
  heading: string;
  content: string;
}

// ==================== 测验组件 ====================

interface QuizBlockProps {
  questions: QuizQuestion[];
  title?: string;
}

export function QuizBlock({ questions, title }: QuizBlockProps) {
  const { t } = useTranslation('workspace');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(
    new Set()
  );

  const currentQuestion = questions[currentIndex];
  const isAnswered = answeredQuestions.has(currentIndex);
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleSelectAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
  };

  const handleConfirm = () => {
    if (selectedAnswer === null || isAnswered) return;
    setAnsweredQuestions((prev) => new Set(prev).add(currentIndex));
    if (selectedAnswer === currentQuestion.correctIndex) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
    } else {
      setShowResult(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setSelectedAnswer(null);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setAnsweredQuestions(new Set());
  };

  if (questions.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-xl text-slate-500 text-center">
        {t('quiz.empty', '暂无测验题目')}
      </div>
    );
  }

  if (showResult) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 text-center space-y-4">
        <div className="text-6xl">
          {percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : '💪'}
        </div>
        <h3 className="text-xl font-bold text-slate-800">
          {t('quiz.completed', '测验完成！')}
        </h3>
        <p className="text-lg text-slate-600">
          {t('quiz.score', '得分')}:{' '}
          <span className="font-bold text-purple-600">
            {score}/{questions.length}
          </span>{' '}
          ({percentage}%)
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        >
          {t('quiz.retry', '重新测验')}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-purple-600" />
          <span className="font-medium text-slate-700">
            {title || t('quiz.title', '知识测验')}
          </span>
          <span className="text-sm text-slate-500">
            ({questions.length} {t('quiz.questions', '题')})
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 text-muted-foreground hover:text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 进度条 */}
      <div className="relative h-1.5 bg-white/50 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-purple-500 transition-all duration-slow"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 题目 */}
      <div className="bg-white rounded-xl p-4 space-y-4">
        <div className="text-xs text-purple-500 font-medium">
          {t('quiz.question', '问题')} {currentIndex + 1}/{questions.length}
        </div>
        <p className="text-lg text-slate-800 leading-relaxed">
          {currentQuestion.question}
        </p>

        {/* 选项 */}
        <div className="space-y-2">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedAnswer === idx;
            const isCorrectOption = idx === currentQuestion.correctIndex;
            let optionClass =
              'border-slate-200 hover:border-purple-300 hover:bg-purple-50';

            if (isAnswered) {
              if (isCorrectOption) {
                optionClass = 'border-green-500 bg-green-50 text-green-700';
              } else if (isSelected && !isCorrectOption) {
                optionClass = 'border-red-500 bg-red-50 text-red-700';
              }
            } else if (isSelected) {
              optionClass = 'border-purple-500 bg-purple-50';
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectAnswer(idx)}
                disabled={isAnswered}
                className={`w-full p-3 text-left rounded-lg border-2 transition-all ${optionClass}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-sm font-medium">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{option}</span>
                  {isAnswered && isCorrectOption && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {isAnswered && isSelected && !isCorrectOption && (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 解释 */}
        {isAnswered && currentQuestion.explanation && (
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <span className="font-medium">
              {t('quiz.explanation', '解释')}:
            </span>{' '}
            {currentQuestion.explanation}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-white/50 rounded-lg transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('quiz.prev', '上一题')}
        </button>

        {!isAnswered ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedAnswer === null}
            className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
          >
            {t('quiz.confirm', '确认答案')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            {currentIndex < questions.length - 1
              ? t('quiz.next', '下一题')
              : t('quiz.finish', '查看结果')}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ==================== 思维导图组件 ====================

interface MindmapBlockProps {
  root: MindmapNode;
  title?: string;
}

function MindmapNodeItem({
  node,
  level = 0
}: {
  node: MindmapNode;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;

  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500'
  ];
  const bgColor = colors[level % colors.length];

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 p-0.5 rounded hover:bg-slate-200 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-5" />}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${level === 0 ? bgColor + ' text-white' : 'bg-slate-100'}`}
        >
          <div
            className={`w-2 h-2 rounded-full ${level === 0 ? 'bg-white/50' : bgColor}`}
          />
          <span className={`text-sm ${level === 0 ? 'font-medium' : ''}`}>
            {node.text}
          </span>
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="ml-6 mt-1 pl-4 border-l-2 border-slate-200 space-y-1">
          {node.children!.map((child) => (
            <MindmapNodeItem key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MindmapBlock({ root, title }: MindmapBlockProps) {
  const { t } = useTranslation('workspace');

  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-blue-600" />
        <span className="font-medium text-slate-700">
          {title || t('mindmap.title', '思维导图')}
        </span>
      </div>
      <div className="bg-white rounded-xl p-4 overflow-x-auto">
        <MindmapNodeItem node={root} />
      </div>
    </div>
  );
}

// ==================== 报告组件 ====================

interface ReportBlockProps {
  title: string;
  sections: ReportSection[];
  keyPoints: string[];
}

export function ReportBlock({ title, sections, keyPoints }: ReportBlockProps) {
  const { t } = useTranslation('workspace');
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set([0])
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-amber-600" />
        <span className="font-medium text-slate-700">
          {t('report.title', '分析报告')}
        </span>
      </div>

      {/* 标题 */}
      <h3 className="text-lg font-bold text-slate-800 bg-white rounded-lg p-3">
        {title}
      </h3>

      {/* 关键要点 */}
      {keyPoints.length > 0 && (
        <div className="bg-white rounded-xl p-4">
          <h4 className="text-sm font-medium text-amber-600 mb-2">
            {t('report.keyPoints', '关键要点')}
          </h4>
          <ul className="space-y-1">
            {keyPoints.map((point, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-slate-700"
              >
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 章节 */}
      <div className="space-y-2">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-white rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(idx)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <span className="font-medium text-slate-700">
                {section.heading}
              </span>
              {expandedSections.has(idx) ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {expandedSections.has(idx) && (
              <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 摘要组件 ====================

interface SummaryBlockProps {
  title: string;
  summary: string;
  keyPoints: string[];
}

export function SummaryBlock({ title, summary, keyPoints }: SummaryBlockProps) {
  const { t } = useTranslation('workspace');

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-green-600" />
        <span className="font-medium text-slate-700">
          {t('summary.blockTitle', '内容摘要')}
        </span>
      </div>

      <div className="bg-white rounded-xl p-4 space-y-4">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          {summary}
        </p>

        {keyPoints.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-sm font-medium text-green-600 mb-2">
              {t('summary.keyPoints', '要点')}
            </h4>
            <ul className="space-y-1">
              {keyPoints.map((point, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 音频组件 ====================

interface AudioBlockProps {
  audioUrl: string;
  duration?: number;
  format?: string;
  title?: string;
}

export function AudioBlock({ audioUrl, duration, title }: AudioBlockProps) {
  const { t } = useTranslation('workspace');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${title || 'audio'}.wav`;
    link.click();
  };

  return (
    <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-violet-600" />
          <span className="font-medium text-slate-700">
            {title || t('audio.title', '音频概览')}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white/50 rounded-lg transition-colors"
          title={t('audio.download', '下载音频')}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-xl p-4">
        <audio src={audioUrl} controls className="w-full" />
        {duration && (
          <div className="mt-2 text-xs text-slate-500 text-center">
            {t('audio.duration', '时长')}: {formatTime(duration)}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 视频组件 ====================

interface VideoBlockProps {
  videoUrl: string;
  duration?: number;
  format?: string;
  title?: string;
}

export function VideoBlock({ videoUrl, duration, title }: VideoBlockProps) {
  const { t } = useTranslation('workspace');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `${title || 'video'}.mp4`;
    link.click();
  };

  return (
    <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-rose-600" />
          <span className="font-medium text-slate-700">
            {title || t('video.title', '视频概览')}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white/50 rounded-lg transition-colors"
          title={t('video.download', '下载视频')}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-black rounded-xl overflow-hidden">
        <video src={videoUrl} controls className="w-full max-h-[400px]" />
      </div>
      {duration && (
        <div className="text-xs text-slate-500 text-center">
          {t('video.duration', '时长')}: {formatTime(duration)}
        </div>
      )}
    </div>
  );
}

// ==================== 信息图组件 ====================

interface InfographicBlockProps {
  imageUrl: string;
  format?: string;
  title?: string;
}

export function InfographicBlock({ imageUrl, title }: InfographicBlockProps) {
  const { t } = useTranslation('workspace');
  const [isZoomed, setIsZoomed] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${title || 'infographic'}.png`;
    link.click();
  };

  return (
    <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-cyan-600" />
          <span className="font-medium text-slate-700">
            {title || t('infographic.title', '信息图')}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white/50 rounded-lg transition-colors"
          title={t('infographic.download', '下载图片')}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div
        className="bg-white rounded-xl p-2 cursor-pointer"
        onClick={() => setIsZoomed(!isZoomed)}
      >
        <img
          src={imageUrl}
          alt={title || 'Infographic'}
          className={`w-full rounded-lg transition-transform ${isZoomed ? 'scale-150' : ''}`}
        />
      </div>
      <div className="text-xs text-slate-500 text-center">
        {t('infographic.clickToZoom', '点击图片放大/缩小')}
      </div>
    </div>
  );
}

// ==================== 演示文稿组件 ====================

interface SlideDeckBlockProps {
  fileUrl: string;
  format?: string;
  slideCount?: number;
  title?: string;
}

export function SlideDeckBlock({
  fileUrl,
  slideCount,
  title
}: SlideDeckBlockProps) {
  const { t } = useTranslation('workspace');

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${title || 'presentation'}.pptx`;
    link.click();
  };

  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Presentation className="w-5 h-5 text-orange-600" />
        <span className="font-medium text-slate-700">
          {title || t('slideDeck.title', '演示文稿')}
        </span>
      </div>

      <div className="bg-white rounded-xl p-6 text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-orange-100 rounded-2xl flex items-center justify-center">
          <Presentation className="w-8 h-8 text-orange-500" />
        </div>
        <div>
          <p className="text-slate-700 font-medium">
            {title || t('slideDeck.ready', '演示文稿已生成')}
          </p>
          {slideCount && (
            <p className="text-sm text-slate-500">
              {slideCount} {t('slideDeck.slides', '页')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Download className="w-4 h-4" />
          {t('slideDeck.download', '下载 PPTX')}
        </button>
      </div>
    </div>
  );
}

// ==================== 数据表格组件 ====================

interface DataTableBlockProps {
  content: string; // CSV content
  format?: string;
  rowCount?: number;
  columnCount?: number;
  title?: string;
}

export function DataTableBlock({
  content,
  rowCount,
  columnCount,
  title
}: DataTableBlockProps) {
  const { t } = useTranslation('workspace');

  // 解析 CSV 内容
  const tableData = useMemo(() => {
    const lines = content.trim().split('\n');
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines
      .slice(1)
      .map((line) =>
        line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
      );

    return { headers, rows };
  }, [content]);

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'data'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className="w-5 h-5 text-slate-600" />
          <span className="font-medium text-slate-700">
            {title || t('dataTable.title', '数据表格')}
          </span>
          {rowCount && columnCount && (
            <span className="text-sm text-slate-500">
              ({rowCount} × {columnCount})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white/50 rounded-lg transition-colors"
          title={t('dataTable.download', '下载 CSV')}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {tableData.headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="px-4 py-2 text-left font-medium text-slate-700 border-b"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.rows.slice(0, 100).map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50">
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="px-4 py-2 text-slate-600 border-b border-slate-100"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tableData.rows.length > 100 && (
          <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 text-center">
            {t('dataTable.showingFirst', '显示前 100 行，共')}{' '}
            {tableData.rows.length} {t('dataTable.rows', '行')}
          </div>
        )}
      </div>
    </div>
  );
}
