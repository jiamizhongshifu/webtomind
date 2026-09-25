import { useCallback, useState } from 'react';
import { createLogger } from '@/utils/logger';
import { skillChatStream } from '@/services/agent-api';
import type { SkillCatalogItem } from '../utils/skill-catalog';
import type { SkillExecutionConfig } from '../components/SkillConfigDialog';
import type { Reference } from '@/types';
import type { SavedSummary } from '@/services/database';
import type { UnifiedMessage } from '@/types/unified-chat';

const log = createLogger('useSkillExecution');

export interface SkillExecutionOptions {
  projectId: string | null;
  selectedSummaries: SavedSummary[];
  references: Reference[];
  targetDocumentId?: string | null;
}

export interface SkillExecutionState {
  isExecuting: boolean;
  error: string | null;
}

export interface UseSkillExecutionReturn {
  executeSkill: (
    skill: SkillCatalogItem,
    config: SkillExecutionConfig
  ) => Promise<void>;
  isExecuting: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * 技能执行 Hook
 * 将 SkillConfigDialog 的配置转换为技能执行请求
 *
 * 当前实现：兼容现有 skillChatStream，将配置注入到 prompt 中
 * 未来迁移：切换到 OpenClaw Runtime 执行
 */
export function useSkillExecution(
  options: SkillExecutionOptions,
  _setUnifiedMessages?: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>,
  onExecutionComplete?: (result: { success: boolean; content?: string }) => void
): UseSkillExecutionReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * 构建带配置的技能提示
   */
  const buildConfiguredPrompt = useCallback(
    (skill: SkillCatalogItem, config: SkillExecutionConfig): string => {
      const parts: string[] = [];

      // 基础提示
      parts.push(`使用技能: ${skill.displayName || skill.name}`);

      // 格式选择
      if (config.format) {
        const formatMap: Record<string, string> = {
          deep_dive: '深入探究',
          summary: '摘要',
          review: '评论',
          debate: '辩论',
          bullet: '要点列表',
          hierarchy: '层级结构',
          table: '对比表格',
          hierarchical: '层级大纲',
          mindmap: '思维导图',
          linear: '线性大纲',
          standard: '标准润色',
          professional: '专业风格',
          casual: '轻松风格',
          web_search: '全网搜索',
          academic_search: '学术搜索',
          news_search: '新闻搜索'
        };
        parts.push(`\n格式: ${formatMap[config.format] || config.format}`);
      }

      // 参数配置
      if (Object.keys(config.params).length > 0) {
        parts.push('\n参数设置:');
        Object.entries(config.params).forEach(([key, value]) => {
          const paramLabels: Record<string, Record<string, string>> = {
            language: {
              'zh-CN': '简体中文',
              'en-US': 'English',
              'ja-JP': '日本語'
            },
            length: {
              short: '简短',
              medium: '适中',
              long: '详细'
            },
            depth: {
              shallow: '浅层',
              medium: '标准',
              deep: '深层'
            },
            focus: {
              structure: '结构',
              language: '语言',
              balanced: '平衡'
            }
          };
          const label = paramLabels[key]?.[String(value)] || String(value);
          parts.push(`  - ${key}: ${label}`);
        });
      }

      // 自定义提示
      if (config.customPrompt) {
        parts.push(`\n额外要求:\n${config.customPrompt}`);
      }

      // 来源信息
      if (options.selectedSummaries.length > 0) {
        parts.push(`\n已选来源: ${options.selectedSummaries.length} 个素材`);
      }

      // 目标文档
      if (config.targetDocumentId) {
        parts.push('\n目标: 写入现有文档');
      }

      return parts.join('\n');
    },
    [options.selectedSummaries]
  );

  /**
   * 执行技能
   */
  const executeSkill = useCallback(
    async (skill: SkillCatalogItem, config: SkillExecutionConfig) => {
      setIsExecuting(true);
      setError(null);

      try {
        log.info('[useSkillExecution] Executing skill:', skill.name, config);

        // 构建配置化的提示
        const configuredPrompt = buildConfiguredPrompt(skill, config);

        // 创建 AbortController
        const abortController = new AbortController();

        // 执行技能（通过 skillChatStream）
        const context = {
          references:
            options.selectedSummaries.length > 0
              ? options.selectedSummaries
                  .map((s) => `${s.title}\n${s.markdown || ''}`)
                  .join('\n\n---\n\n')
              : undefined,
          pageInfo: undefined
        };

        // 构建 skillHint
        const skillHint = {
          id: skill.id,
          name: skill.displayName || skill.name,
          source: skill.source,
          explicit: true
        };

        // 流式执行
        let fullContent = '';
        for await (const chunk of skillChatStream(configuredPrompt, {
          skillId: skill.id,
          skillHint,
          context,
          signal: abortController.signal
        })) {
          if (chunk.type === 'text') {
            fullContent += chunk.data.content || '';
          } else if (chunk.type === 'error') {
            throw new Error(chunk.data.message || '执行失败');
          }
        }

        log.info('[useSkillExecution] Skill executed successfully');
        onExecutionComplete?.({ success: true, content: fullContent });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '技能执行失败';
        log.error('[useSkillExecution] Execution failed:', errorMessage);
        setError(errorMessage);
        onExecutionComplete?.({ success: false });
      } finally {
        setIsExecuting(false);
      }
    },
    [
      buildConfiguredPrompt,
      options.selectedSummaries,
      onExecutionComplete
    ]
  );

  return {
    executeSkill,
    isExecuting,
    error,
    clearError
  };
}
