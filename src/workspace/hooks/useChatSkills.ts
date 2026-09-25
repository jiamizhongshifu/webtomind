import { useState, useRef, useCallback, useMemo } from 'react';
import { createLogger } from '@/utils/logger';
import { skillChatStream, getSkillRun } from '@/services/agent-api';
import { createSkill, saveSummary, type Skill } from '@/services/workspace-api';
import type { TFunction } from 'i18next';
import type {
  UnifiedMessage,
  UnifiedContentBlock,
  ToolCallBlock
} from '@/types/unified-chat';
import type { Reference } from '@/types';
import type { SavedSummary } from '@/services/database';
import type { MatchedSkill } from './useSkills';
import type { SkillResolverCandidate } from '../types/skill-resolver';
import type { SkillCreatePreview } from '../components/SkillCreateConfirmDialog';
import type { SummaryConfirmDialogProps } from '../components/SummaryConfirmDialog';
import type {
  SearchResultBatchBlock,
  SearchResultBatchItem
} from '@/types/content-blocks';
import { extractTextFromReferences } from '../utils/chat-helpers';

const log = createLogger('useChatSkills');

interface UseChatSkillsProps {
  references: Reference[];
  summaries: SavedSummary[];
  onRemoveReference?: (id: string) => void;
  setUnifiedMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  saveCurrentConversation: () => Promise<void>;
  setInput: (input: string) => void;
  clearAttachments: () => void;
  t: TFunction<'workspace'>;
  refreshSkills: () => Promise<void>;
  setToast: (
    toast: { message: string; type: 'success' | 'error' } | null
  ) => void;
  setSummaryConfirmType: React.Dispatch<
    React.SetStateAction<'create' | 'update' | 'delete' | null>
  >;
  setSummaryConfirmData: React.Dispatch<
    React.SetStateAction<SummaryConfirmDialogProps['data'] | null>
  >;
}

export function useChatSkills({
  references,
  summaries,
  onRemoveReference,
  setUnifiedMessages,
  saveCurrentConversation,
  setInput,
  clearAttachments,
  t,
  refreshSkills,
  setToast,
  setSummaryConfirmType,
  setSummaryConfirmData
}: UseChatSkillsProps) {
  const [matchedSkillsState, setMatchedSkillsState] = useState<MatchedSkill[]>([]);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [selectedSkillCandidate, setSelectedSkillCandidateState] =
    useState<SkillResolverCandidate | null>(null);

  // Skills 相关状态
  const setMatchedSkills = useCallback((skills: MatchedSkill[]) => {
    setMatchedSkillsState(skills);
    if (selectedSkillCandidate?.explicit) {
      setShowSkillSelector(false);
      return;
    }
    setShowSkillSelector(skills.length > 0);
  }, [selectedSkillCandidate]);

  const setSelectedSkillCandidate = useCallback(
    (candidate: SkillResolverCandidate | null) => {
      setSelectedSkillCandidateState(candidate);
      if (candidate?.explicit) {
        setShowSkillSelector(false);
        setMatchedSkillsState([]);
      }
    },
    []
  );
  const selectedSkill = selectedSkillCandidate?.skill ?? null;
  const [showSkillConfirm, setShowSkillConfirm] = useState(false);
  const [pendingSkillPrompt, setPendingSkillPrompt] = useState('');

  // Skill 创建相关状态
  const [skillCreatePreview, setSkillCreatePreview] =
    useState<SkillCreatePreview | null>(null);
  const [showSkillCreateDialog, setShowSkillCreateDialog] = useState(false);

  // Skill 聊天加载状态和中止控制器
  const [isSkillChatLoading, setIsSkillChatLoading] = useState(false);
  const skillChatAbortControllerRef = useRef<AbortController | null>(null);
  /** 记录最近一次搜索工具的查询词，供 tool_result 构建批次使用 */
  const lastSearchQueryRef = useRef<string>('');

  // ── 搜索批次状态（Agent-Reach 搜索新来源） ──
  const [currentSearchBatch, setCurrentSearchBatch] =
    useState<SearchResultBatchBlock | null>(null);
  const isSearchBatchLocked =
    currentSearchBatch !== null &&
    currentSearchBatch.status !== 'resolved';

  /** 从 artifact data 归一化搜索批次 */
  const normalizeSearchBatch = useCallback(
    (
      artifactData: Record<string, unknown>,
      runId?: string,
      artifactId?: string
    ): SearchResultBatchBlock | null => {
      const kind = artifactData.kind ?? artifactData.type;
      if (kind !== 'search_result_batch') return null;

      const rawItems = Array.isArray(artifactData.items)
        ? (artifactData.items as Array<Record<string, unknown>>)
        : [];
      const items: SearchResultBatchItem[] = rawItems.map((item) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: item.snippet ? String(item.snippet) : undefined,
        score: typeof item.score === 'number' ? item.score : undefined,
        sourceLabel: item.sourceLabel
          ? String(item.sourceLabel)
          : undefined
      }));

      return {
        type: 'search_result_batch',
        batchId: String(artifactData.batchId ?? crypto.randomUUID()),
        runId,
        query: String(artifactData.query ?? ''),
        status: 'pending_review',
        items,
        totalCount:
          typeof artifactData.totalCount === 'number'
            ? artifactData.totalCount
            : items.length,
        rawArtifactId: artifactId
      };
    },
    []
  );

  /** 导入批次项到项目 summaries */
  const importSearchBatch = useCallback(
    async (
      items: SearchResultBatchItem[],
      projectId?: string | null
    ): Promise<{ imported: number; failed: number }> => {
      if (!items.length) return { imported: 0, failed: 0 };

      setCurrentSearchBatch((prev) =>
        prev ? { ...prev, status: 'importing' as const } : prev
      );

      let imported = 0;
      let failed = 0;

      for (const item of items) {
        try {
          await saveSummary({
            title: item.title || item.url,
            url: item.url,
            markdown: item.snippet || '',
            tags: ['agent-reach', 'search-batch'],
            project_id: projectId || undefined,
            content_type: 'article'
          });
          imported++;
        } catch {
          failed++;
        }
      }

      setCurrentSearchBatch((prev) =>
        prev ? { ...prev, status: 'resolved' as const } : prev
      );

      return { imported, failed };
    },
    []
  );

  /** 删除/解散当前批次 */
  const dismissSearchBatch = useCallback(() => {
    setCurrentSearchBatch(null);
  }, []);

  const stopSkillChat = useCallback(() => {
    if (skillChatAbortControllerRef.current) {
      skillChatAbortControllerRef.current.abort();
      skillChatAbortControllerRef.current = null;
      setIsSkillChatLoading(false);
    }
  }, []);

  const setSelectedSkill = useCallback((skill: Skill | null) => {
    if (!skill) {
      setSelectedSkillCandidateState(null);
      setShowSkillSelector(false);
      return;
    }
    setSelectedSkillCandidateState((prev) => {
      if (prev?.skill.id === skill.id) {
        return { ...prev, skill };
      }
      return {
        skill,
        source: skill.source,
        score: 0,
        matchedTriggers: [],
        explicit: true
      };
    });
    setShowSkillSelector(false);
  }, []);

  const selectedSkillHint = useMemo(
    () =>
      selectedSkillCandidate
        ? {
            id: selectedSkillCandidate.skill.id,
            name:
              selectedSkillCandidate.skill.displayName ||
              selectedSkillCandidate.skill.name,
            source: selectedSkillCandidate.source,
            explicit: selectedSkillCandidate.explicit,
            matchedTriggers: selectedSkillCandidate.matchedTriggers
          }
        : null,
    [selectedSkillCandidate]
  );

  const handleSendWithSkill = useCallback(
    async (prompt: string, candidate: SkillResolverCandidate) => {
      const skill = candidate.skill;
      log.info('[ChatArea] Sending with Skill:', skill.displayName);

      // 取消之前的 Skill 聊天请求
      stopSkillChat();

      // 创建新的 AbortController
      const abortController = new AbortController();
      skillChatAbortControllerRef.current = abortController;

      setIsSkillChatLoading(true);

      setInput('');
      clearAttachments();
      setSelectedSkill(null);
      setSelectedSkillCandidate(null);
      setPendingSkillPrompt('');

      // 构建上下文
      const refText =
        references.length > 0
          ? extractTextFromReferences(references)
          : undefined;
      const pageInfo =
        references.length > 0 && references[0].type === 'summary'
          ? {
              url:
                summaries.find((s) => s.id === references[0].summaryId)?.url ||
                '',
              title: references[0].summaryTitle || ''
            }
          : undefined;

      const userMessage: UnifiedMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        blocks: [{ type: 'text', content: prompt }],
        timestamp: Date.now(),
        sourceMode: 'agent'
      };

      const assistantMessage: UnifiedMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        blocks: [
          {
            type: 'status',
            status: 'analyzing',
            message: `使用 ${skill.displayName}...`
          }
        ],
        timestamp: Date.now(),
        sourceMode: 'agent',
        agentRun: {
          runId: '',
          stepId: 0,
          startedAt: Date.now(),
          timeline: [],
          status: 'running',
          localCandidates: selectedSkillCandidate
            ? [
                {
                  name: selectedSkillCandidate.skill.displayName || selectedSkillCandidate.skill.name,
                  source: selectedSkillCandidate.source
                }
              ]
            : []
        }
      };

      setUnifiedMessages((prev) => [...prev, userMessage, assistantMessage]);

      if (onRemoveReference) {
        references.forEach((ref) => onRemoveReference(ref.id));
      }

      try {
        let textContent = '';
        for await (const chunk of skillChatStream(prompt, {
          skillId: skill.id,
          skillHint: selectedSkillHint || undefined,
          context: { references: refText, pageInfo },
          signal: abortController.signal
        })) {
          if (abortController.signal.aborted) {
            break;
          }
          if (chunk.type === 'run_started') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      agentRun: {
                        runId: chunk.data.runId || '',
                        stepId: 0,
                        startedAt: Date.now(),
                        timeline: [],
                        status: 'running',
                        localCandidates: selectedSkillCandidate
                          ? [
                              {
                                name:
                                  selectedSkillCandidate.skill.displayName ||
                                  selectedSkillCandidate.skill.name,
                                source: selectedSkillCandidate.source
                              }
                            ]
                          : []
                      }
                    }
                  : m
              )
            );
          } else if (chunk.type === 'resolver_result') {
            const resolvedSkills = chunk.data.matchedSkills || [];
            if (resolvedSkills.length > 0 || chunk.data.localHint) {
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id && m.agentRun
                    ? {
                        ...m,
                        agentRun: {
                          ...m.agentRun,
                          localCandidates: chunk.data.localHint
                            ? [
                                {
                                  name: chunk.data.localHint.name,
                                  source: chunk.data.localHint.source
                                }
                              ]
                            : m.agentRun.localCandidates,
                          resolvedSkills: resolvedSkills.map((skill) => ({
                            name: skill.name,
                            source: skill.source
                          })),
                          timeline: [
                            ...(m.agentRun.timeline || []),
                            {
                              id: crypto.randomUUID(),
                              title: `Resolved: ${resolvedSkills.map((skill) => `${skill.name}(${skill.source})`).join(', ')}`,
                              kind: 'resolution',
                              status: 'completed',
                              startedAt: Date.now(),
                              endedAt: Date.now()
                            }
                          ]
                        }
                      }
                    : m
                )
              );
            }
          } else if (chunk.type === 'step_started') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      agentRun: m.agentRun
                        ? {
                            ...m.agentRun,
                            stepId:
                              typeof chunk.data.stepId === 'string'
                                ? Number.parseInt(chunk.data.stepId.replace(/\D/g, ''), 10) || m.agentRun.stepId + 1
                                : m.agentRun.stepId + 1,
                            timeline: [
                              ...(m.agentRun.timeline || []),
                              {
                                id: chunk.data.stepId || crypto.randomUUID(),
                                title: chunk.data.title || '执行步骤',
                                kind: chunk.data.kind,
                                status: 'running',
                                startedAt: Date.now()
                              }
                            ],
                            status: 'running'
                          }
                        : m.agentRun,
                      blocks: [
                        ...m.blocks.filter((b) => b.type !== 'status'),
                        {
                          type: 'status' as const,
                          status: 'executing' as const,
                          message: chunk.data.title || '正在执行技能步骤...'
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (chunk.type === 'step_completed') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id && m.agentRun
                  ? {
                      ...m,
                      agentRun: {
                        ...m.agentRun,
                        timeline: (m.agentRun.timeline || []).map((step) =>
                          step.id === chunk.data.stepId
                            ? {
                                ...step,
                                status:
                                  chunk.data.errorMessage || chunk.data.status === 'failed'
                                    ? 'failed'
                                    : 'completed',
                                endedAt: Date.now(),
                                errorMessage: chunk.data.errorMessage
                                  ? String(chunk.data.errorMessage)
                                  : step.errorMessage
                              }
                            : step
                        )
                      }
                    }
                  : m
              )
            );
          } else if (chunk.type === 'artifact_created') {
            // ── 检查是否为搜索结果批次 ──
            const artifactData = chunk.data as Record<string, unknown>;
            const batch = normalizeSearchBatch(
              artifactData,
              undefined,
              chunk.data.artifactId
            );
            if (batch) {
              setCurrentSearchBatch(batch);
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        agentRun: m.agentRun
                          ? {
                              ...m.agentRun,
                              timeline: [
                                ...(m.agentRun.timeline || []),
                                {
                                  id: chunk.data.artifactId || crypto.randomUUID(),
                                  title: `搜索批次：${batch.query}`,
                                  status: 'completed',
                                  startedAt: Date.now(),
                                  endedAt: Date.now()
                                }
                              ]
                            }
                          : m.agentRun,
                        blocks: [...m.blocks, batch]
                      }
                    : m
                )
              );
            } else if (chunk.data.preview) {
              setUnifiedMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        agentRun: m.agentRun
                          ? {
                              ...m.agentRun,
                              timeline: [
                                ...(m.agentRun.timeline || []),
                                {
                                  id: chunk.data.artifactId || crypto.randomUUID(),
                                  title: `产物：${chunk.data.title || 'Artifact'}`,
                                  status: 'completed',
                                  startedAt: Date.now(),
                                  endedAt: Date.now()
                                }
                              ]
                            }
                          : m.agentRun,
                        blocks: [
                          ...m.blocks,
                          {
                            type: 'text' as const,
                            content: `已生成产物：${chunk.data.preview}`
                          }
                        ]
                      }
                    : m
                )
              );
            }
          } else if (chunk.type === 'run_waiting_async') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      agentRun: m.agentRun
                        ? { ...m.agentRun, status: 'waiting_async' }
                        : m.agentRun,
                      blocks: [
                        ...m.blocks.filter((b) => b.type !== 'status'),
                        {
                          type: 'status' as const,
                          status: 'executing' as const,
                          message: chunk.data.message || '任务已进入异步处理，请稍后查看结果。'
                        }
                      ]
                    }
                  : m
              )
            );

            if (chunk.data.runId) {
              window.setTimeout(() => {
                void getSkillRun(String(chunk.data.runId))
                  .then((details) => {
                    // ── 从异步恢复的 artifacts 中提取搜索批次 ──
                    if (details.artifacts && Array.isArray(details.artifacts)) {
                      for (const art of details.artifacts) {
                        const artData = (art.data ?? {}) as Record<string, unknown>;
                        const batch = normalizeSearchBatch(
                          artData,
                          String(chunk.data.runId),
                          art.id
                        );
                        if (batch) {
                          setCurrentSearchBatch(batch);
                          break;
                        }
                      }
                    }

                    setUnifiedMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessage.id && m.agentRun
                          ? {
                              ...m,
                              agentRun: {
                                ...m.agentRun,
                                status:
                                  details.run.status === 'completed'
                                    ? 'completed'
                                    : details.run.status === 'failed'
                                      ? 'failed'
                                      : 'waiting_async',
                                endedAt: details.run.endedAt,
                                timeline: details.steps.map((step) => ({
                                  id: step.id,
                                  title: step.title,
                                  kind: step.kind,
                                  status:
                                    step.status === 'failed'
                                      ? 'failed'
                                      : step.status === 'completed'
                                        ? 'completed'
                                        : 'running',
                                  startedAt: step.startedAt,
                                  endedAt: step.endedAt,
                                  errorMessage: step.errorMessage
                                }))
                              }
                            }
                          : m
                      )
                    );
                  })
                  .catch(() => {
                    // 忽略恢复查询失败，保留当前等待状态
                  });
              }, 2000);
            }
          } else if (chunk.type === 'run_completed') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id && m.agentRun
                  ? {
                      ...m,
                      agentRun: {
                        ...m.agentRun,
                        endedAt: Date.now(),
                        status: 'completed',
                        timeline: (m.agentRun.timeline || []).map((step, index, arr) =>
                          index === arr.length - 1 && step.status === 'running'
                            ? { ...step, status: 'completed', endedAt: Date.now() }
                            : step
                        )
                      }
                    }
                  : m
              )
            );
          } else if (chunk.type === 'run_failed') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        ...m.blocks,
                        {
                          type: 'text' as const,
                          content: chunk.data.errorMessage || '技能执行失败'
                        }
                      ],
                      agentRun: m.agentRun
                        ? {
                            ...m.agentRun,
                            endedAt: Date.now(),
                            status: 'failed',
                            timeline: (m.agentRun.timeline || []).map((step, index, arr) =>
                              index === arr.length - 1 && step.status === 'running'
                                ? {
                                    ...step,
                                    status: 'failed',
                                    endedAt: Date.now(),
                                    errorMessage: chunk.data.errorMessage || '技能执行失败'
                                  }
                                : step
                            )
                          }
                        : m.agentRun
                    }
                  : m
              )
            );
          } else if (chunk.type === 'text' && chunk.data.content) {
            textContent += chunk.data.content;
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [{ type: 'text' as const, content: textContent }]
                    }
                  : m
              )
            );
          } else if (chunk.type === 'status') {
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'status' as const,
                          status:
                            (chunk.data.status as
                              | 'analyzing'
                              | 'searching'
                              | 'generating'
                              | 'executing'
                              | 'done'
                              | undefined) || 'analyzing',
                          message: chunk.data.message || ''
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (chunk.type === 'tool_call') {
            const {
              id: toolId,
              name: toolName,
              input: toolInput,
              status: toolStatus,
              requiresConfirmation
            } = chunk.data;
            if (toolId && toolName) {
              // 记录搜索工具的查询词，供后续 tool_result 构建批次
              if (
                (toolName === 'web_search' || toolName === 'grok_x_search') &&
                toolInput &&
                typeof toolInput.query === 'string'
              ) {
                lastSearchQueryRef.current = toolInput.query;
              }
              setUnifiedMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessage.id) return m;
                  const existingIndex = m.blocks.findIndex(
                    (b) => b.type === 'tool_call' && 'id' in b && b.id === toolId
                  );
                  if (existingIndex >= 0) {
                    const nextBlocks = [...m.blocks];
                    const existing = nextBlocks[existingIndex];
                    if (existing.type === 'tool_call') {
                      nextBlocks[existingIndex] = {
                        ...existing,
                        status:
                          toolStatus === 'pending_confirmation'
                            ? 'pending'
                            : ((toolStatus as ToolCallBlock['status']) || existing.status),
                        requiresConfirmation:
                          requiresConfirmation ?? existing.requiresConfirmation
                      };
                    }
                    return { ...m, blocks: nextBlocks };
                  }
                  return {
                    ...m,
                    blocks: [
                      ...m.blocks.filter((b) => b.type !== 'status'),
                      {
                        type: 'tool_call' as const,
                        id: toolId,
                        name: toolName,
                        input: toolInput || {},
                        status:
                          toolStatus === 'pending_confirmation'
                            ? ('pending' as const)
                            : ('running' as const),
                        requiresConfirmation:
                          toolStatus === 'pending_confirmation' || requiresConfirmation
                      }
                    ]
                  };
                })
              );
            }
          } else if (chunk.type === 'tool_result') {
            const {
              id: resultId,
              name: resultName,
              result,
              success,
              cancelled,
              errorMessage,
              requiresConfirmation,
              confirmationState
            } = chunk.data;

            // 从 tool_result 构建搜索批次 block（核心修复）
            let searchBatchToAdd: SearchResultBatchBlock | null = null;
            if (
              (resultName === 'web_search' || resultName === 'grok_x_search') &&
              success &&
              result
            ) {
              let batchItems: SearchResultBatchItem[] = [];
              let batchQuery = lastSearchQueryRef.current;

              if (resultName === 'web_search') {
                const sr = result as {
                  sources?: Array<{ url?: string; title?: string }>;
                  summary?: string;
                };
                batchItems = (sr.sources || []).map((s) => ({
                  title: s.title || s.url || '',
                  url: s.url || '',
                  snippet: sr.summary,
                  sourceLabel: 'web'
                }));
              } else if (resultName === 'grok_x_search') {
                const gr = result as {
                  query?: string;
                  results?: Array<{
                    author?: { handle: string; name: string };
                    content?: string;
                    url: string;
                  }>;
                  summary?: string;
                };
                batchQuery = gr.query || batchQuery;
                batchItems = (gr.results || []).map((r) => ({
                  title: r.author
                    ? `@${r.author.handle}`
                    : '',
                  url: r.url,
                  snippet: r.content,
                  sourceLabel: 'x/twitter'
                }));
              }

              if (batchItems.length > 0) {
                searchBatchToAdd = {
                  type: 'search_result_batch',
                  batchId: crypto.randomUUID(),
                  runId: chunk.data.runId,
                  query: batchQuery,
                  status: 'pending_review',
                  items: batchItems,
                  totalCount: batchItems.length
                };
                setCurrentSearchBatch(searchBatchToAdd);
              }
            }

            if (resultId) {
              setUnifiedMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessage.id) return m;
                  const updatedBlocks = m.blocks.map((block) =>
                    block.type === 'tool_call' &&
                    'id' in block &&
                    block.id === resultId
                      ? {
                          ...block,
                          status: cancelled
                            ? ('cancelled' as const)
                            : success
                              ? ('completed' as const)
                              : ('error' as const),
                          requiresConfirmation:
                            requiresConfirmation ?? block.requiresConfirmation,
                          result: {
                            success: Boolean(success),
                            data: result,
                            error: errorMessage
                              ? String(errorMessage)
                              : undefined
                          }
                        }
                      : block
                  );

                  const newBlocks: UnifiedContentBlock[] = [...updatedBlocks];

                  if (cancelled && confirmationState) {
                    newBlocks.push({
                      type: 'text' as const,
                      content:
                        confirmationState === 'timed_out'
                          ? '工具确认超时，已取消执行。'
                          : '工具执行未获批准，已取消。'
                    });
                  }

                  if (resultName === 'web_search' && success && result) {
                    const searchResult = result as {
                      queries?: string[];
                      sources?: Array<{ url?: string; title?: string }>;
                    };
                    if (
                      searchResult.sources &&
                      searchResult.sources.length > 0
                    ) {
                      const toolCallBlock = m.blocks.find(
                        (b): b is ToolCallBlock =>
                          b.type === 'tool_call' &&
                          'id' in b &&
                          b.id === resultId
                      );
                      const queryFromTool =
                        typeof toolCallBlock?.input?.query === 'string'
                          ? toolCallBlock.input.query
                          : '';
                      const searchQuery =
                        queryFromTool || searchResult.queries?.[0] || '';
                      newBlocks.push({
                        type: 'search' as const,
                        query: searchQuery,
                        sources: searchResult.sources.map((s) => ({
                          url: s.url || '',
                          title: s.title || s.url || ''
                        }))
                      });
                    }
                  }

                  // 将搜索批次 block 追加到消息 blocks
                  if (searchBatchToAdd) {
                    newBlocks.push(searchBatchToAdd);
                  }

                  return { ...m, blocks: newBlocks };
                })
              );
            }
          } else if (chunk.type === 'done') {
            setUnifiedMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMessage.id) return m;
                const filteredBlocks = m.blocks.filter(
                  (b) => b.type !== 'status'
                );
                if (filteredBlocks.length === 0) {
                  return {
                    ...m,
                    blocks: [
                      {
                        type: 'text' as const,
                        content: t('toolCallBlock.completed', 'Completed')
                      }
                    ]
                  };
                }
                const hasText = filteredBlocks.some((b) => b.type === 'text');
                return {
                  ...m,
                  blocks: hasText
                    ? filteredBlocks
                    : [
                        ...filteredBlocks,
                        {
                          type: 'text' as const,
                          content: t('toolCallBlock.completed', 'Completed')
                        }
                      ]
                };
              })
            );
          } else if (
            chunk.type === 'skill_create_preview' &&
            chunk.data.skillPreview
          ) {
            log.info(
              '[ChatArea] Received skill_create_preview:',
              chunk.data.skillPreview
            );
            setSkillCreatePreview(
              chunk.data.skillPreview as SkillCreatePreview
            );
            setShowSkillCreateDialog(true);
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content:
                            textContent +
                            '\n\n正在创建 Skill，请在弹窗中确认...'
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (
            chunk.type === 'summary_create_preview' &&
            chunk.data.summaryPreview
          ) {
            setSummaryConfirmType('create');
            setSummaryConfirmData(
              chunk.data.summaryPreview as SummaryConfirmDialogProps['data']
            );
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content: textContent + '\n\n正在创建卡片，请确认...'
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (chunk.type === 'summary_update_preview' && chunk.data.id) {
            setSummaryConfirmType('update');
            setSummaryConfirmData({
              id: chunk.data.id,
              original: chunk.data.original!,
              updated: chunk.data.updated!,
              projectId: chunk.data.projectId!
            } as SummaryConfirmDialogProps['data']);
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content: textContent + '\n\n正在更新卡片，请确认...'
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (
            chunk.type === 'summary_delete_confirm' &&
            chunk.data.summary
          ) {
            setSummaryConfirmType('delete');
            setSummaryConfirmData({
              summary: chunk.data.summary,
              projectId: chunk.data.projectId!
            } as SummaryConfirmDialogProps['data']);
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content: textContent + '\n\n正在删除卡片，请确认...'
                        }
                      ]
                    }
                  : m
              )
            );
          } else if (chunk.type === 'error') {
            const errorMessage =
              chunk.data.message || chunk.data.error || '未知错误';
            setUnifiedMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      blocks: [
                        {
                          type: 'text' as const,
                          content: `错误: ${errorMessage}`
                        }
                      ]
                    }
                  : m
              )
            );
          }
        }

        setTimeout(() => {
          saveCurrentConversation().catch((err) => {
            log.warn('[ChatArea] Failed to save after Skill chat:', err);
          });
        }, 100);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          log.info('[ChatArea] Skill chat aborted by user');
          return;
        }
        log.error('[ChatArea] Skill chat error:', error);
        setUnifiedMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  blocks: [
                    {
                      type: 'text' as const,
                      content: `错误: ${error instanceof Error ? error.message : '未知错误'}`
                    }
                  ]
                }
              : m
          )
        );
      } finally {
        setIsSkillChatLoading(false);
        skillChatAbortControllerRef.current = null;
      }
    },
    [
      references,
      summaries,
      onRemoveReference,
      setUnifiedMessages,
      saveCurrentConversation,
      t,
      stopSkillChat,
      setInput,
      clearAttachments,
      selectedSkillHint,
      setSummaryConfirmType,
      setSummaryConfirmData,
      normalizeSearchBatch,
      selectedSkillCandidate,
      setSelectedSkill,
      setSelectedSkillCandidate
    ]
  );

  const handleSendWithoutSkill = useCallback(
    (prompt: string) => {
      setInput(prompt);
      setPendingSkillPrompt('');
      setTimeout(() => {
        const sendButton = document.querySelector(
          '[data-testid="chat-send-button"]'
        ) as HTMLButtonElement | null;
        if (sendButton) sendButton.click();
      }, 0);
    },
    [setInput]
  );

  const handleSkillCreateConfirm = useCallback(
    async (skill: SkillCreatePreview) => {
      try {
        await createSkill({
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          icon: skill.icon,
          triggers: skill.triggers,
          coreInstructions: skill.coreInstructions,
          outputType: skill.outputType,
          category: skill.category
        });

        try {
          await refreshSkills();
          log.info('[ChatArea] Skills list refreshed after creation');
        } catch (refreshError) {
          log.warn('[ChatArea] Failed to refresh skills list:', refreshError);
        }

        setToast({
          message: t('skillCreate.success', 'Skill 创建成功'),
          type: 'success'
        });

        setShowSkillCreateDialog(false);
        setSkillCreatePreview(null);
        log.info('[ChatArea] Skill created successfully:', skill.name);
      } catch (error) {
        log.error('[ChatArea] Failed to create Skill:', error);
        throw error;
      }
    },
    [t, refreshSkills, setToast]
  );

  const handleSkillCreateCancel = useCallback(() => {
    setShowSkillCreateDialog(false);
    setSkillCreatePreview(null);
  }, []);

  return {
    matchedSkills: matchedSkillsState,
    setMatchedSkills,
    showSkillSelector,
    setShowSkillSelector,
    selectedSkill,
    selectedSkillCandidate,
    setSelectedSkillCandidate,
    setSelectedSkill,
    showSkillConfirm,
    setShowSkillConfirm,
    pendingSkillPrompt,
    setPendingSkillPrompt,
    skillCreatePreview,
    setSkillCreatePreview,
    showSkillCreateDialog,
    setShowSkillCreateDialog,
    isSkillChatLoading,
    setIsSkillChatLoading,
    stopSkillChat,
    handleSendWithSkill,
    handleSendWithoutSkill,
    handleSkillCreateConfirm,
    handleSkillCreateCancel,
    // 搜索批次状态
    currentSearchBatch,
    isSearchBatchLocked,
    importSearchBatch,
    dismissSearchBatch
  };
}
