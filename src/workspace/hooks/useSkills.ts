/**
 * Skills Hook
 * 管理用户 Skills 的加载和触发词匹配
 *
 * 优化：添加本地缓存机制，减少 API 请求
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import { getAllSkills, type Skill } from '@/services/workspace-api';
import { MATCH_DEBOUNCE_DELAY } from '@/constants/skill-constants';
import type { MarketSkill } from '../data/youmind-market-skills';
import { MARKET_SKILLS } from '../data/youmind-market-skills';
import {
  normalizeMarketSkillToCatalogItem,
  normalizeSkillToCatalogItem,
  type SkillCatalogItem
} from '../utils/skill-catalog';
import type { SkillResolverResult } from '../types/skill-resolver';

const log = createLogger('useSkills');

// 缓存配置
const SKILLS_CACHE_KEY = 'skills_cache_v1';
const SKILLS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存有效期

interface SkillsCache {
  data: Skill[];
  timestamp: number;
  version: number;
}

export interface MatchedSkill {
  skill: Skill;
  score: number;
  matchedTriggers: string[];
}

export interface UseSkillsReturn {
  /** 所有 Skills */
  skills: Skill[];
  /** 统一 Skill Catalog */
  catalog: SkillCatalogItem[];
  /** 市场 Skills */
  marketSkills: MarketSkill[];
  /** 是否加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 匹配 Skills（根据用户输入） */
  matchSkills: (input: string) => MatchedSkill[];
  /** 防抖匹配 Skills（根据用户输入，带回调） */
  matchSkillsDebounced: (
    input: string,
    callback: (results: MatchedSkill[]) => void
  ) => void;
  /** 统一 resolver（前端仅用于候选提示） */
  resolveSkillCandidates: (input: string, explicitSkillId?: string) => SkillResolverResult;
  /** 刷新 Skills 列表（强制刷新，忽略缓存） */
  refresh: () => Promise<void>;
  /** 根据 ID 获取 Skill */
  getSkillById: (id: string) => Skill | undefined;
}

interface UseSkillsOptions {
  enabled?: boolean;
}

/**
 * 从 localStorage 读取缓存
 */
function getSkillsFromCache(): Skill[] | null {
  try {
    const cached = localStorage.getItem(SKILLS_CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp, version }: SkillsCache = JSON.parse(cached);

    // 检查版本和过期时间
    if (version !== 1 || Date.now() - timestamp > SKILLS_CACHE_TTL) {
      log.info('[useSkills] Cache expired or version mismatch');
      localStorage.removeItem(SKILLS_CACHE_KEY);
      return null;
    }

    log.info('[useSkills] Cache hit, skills:', data.length);
    return data;
  } catch {
    localStorage.removeItem(SKILLS_CACHE_KEY);
    return null;
  }
}

/**
 * 保存到 localStorage 缓存
 */
function saveSkillsToCache(skills: Skill[]): void {
  try {
    const cache: SkillsCache = {
      data: skills,
      timestamp: Date.now(),
      version: 1
    };
    localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(cache));
    log.info('[useSkills] Cache saved, skills:', skills.length);
  } catch (err) {
    log.warn('[useSkills] Failed to save cache:', err);
  }
}

/**
 * Skills 管理 Hook
 */
export function useSkills(options: UseSkillsOptions = {}): UseSkillsReturn {
  const { enabled = true } = options;
  const [skills, setSkills] = useState<Skill[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 缓存 Skills 用于快速匹配
  const skillsRef = useRef<Skill[]>([]);

  // 防抖定时器引用
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 是否已经从缓存加载
  const cacheLoadedRef = useRef(false);

  /**
   * 从 API 加载 Skills
   * @param forceRefresh 是否强制刷新（忽略缓存）
   */
  const loadSkills = useCallback(
    async (forceRefresh = false) => {
      if (!enabled) {
        setLoading(false);
        setError(null);
        setSkills([]);
        setCatalog(MARKET_SKILLS.map((skill) => normalizeMarketSkillToCatalogItem(skill)));
        skillsRef.current = [];
        return;
      }

      try {
        // 如果不是强制刷新，先尝试从缓存加载
        if (!forceRefresh && !cacheLoadedRef.current) {
          const cachedSkills = getSkillsFromCache();
          if (cachedSkills && cachedSkills.length > 0) {
            const installedMarketSkillIds = new Set(
              cachedSkills
                .map((skill) => skill.metadata?.marketSkillId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
            );
            setSkills(cachedSkills);
            setCatalog([
              ...cachedSkills.map(normalizeSkillToCatalogItem),
              ...MARKET_SKILLS.map((skill) =>
                normalizeMarketSkillToCatalogItem(skill, {
                  isInstalled: installedMarketSkillIds.has(skill.id)
                })
              )
            ]);
            skillsRef.current = cachedSkills;
            setLoading(false);
            cacheLoadedRef.current = true;
            // 后台静默刷新
            loadSkills(true).catch(() => {});
            return;
          }
        }

        setLoading(true);
        setError(null);

        // API 现在返回的是已过滤的激活 Skills
        const data = await getAllSkills();
        const normalizedSkills = data.map((skill) => ({
          ...skill,
          source: skill.source || 'user'
        }));
        const activeSkills = normalizedSkills.filter((s) => s.isActive);
        const installedMarketSkillIds = new Set(
          activeSkills
            .map((skill) => skill.metadata?.marketSkillId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        );

        setSkills(activeSkills);
        setCatalog([
          ...activeSkills.map(normalizeSkillToCatalogItem),
          ...MARKET_SKILLS.map((skill) =>
            normalizeMarketSkillToCatalogItem(skill, {
              isInstalled: installedMarketSkillIds.has(skill.id)
            })
          )
        ]);
        skillsRef.current = activeSkills;

        // 保存到缓存
        saveSkillsToCache(activeSkills);

        log.info(
          '[useSkills] Loaded',
          activeSkills.length,
          'active skills from API'
        );
      } catch (err) {
        log.error('[useSkills] Failed to load skills:', err);
        setError(err instanceof Error ? err.message : '加载 Skills 失败');
      } finally {
        setLoading(false);
      }
    },
    [enabled]
  );

  // 初始加载
  useEffect(() => {
    if (!enabled) {
      return;
    }
    loadSkills(false);
  }, [enabled, loadSkills]);

  /**
   * 匹配 Skills
   * 根据用户输入匹配触发词，返回匹配的 Skills（按分数排序）
   */
  const matchSkills = useCallback(
    (input: string): MatchedSkill[] => {
      if (!enabled) return [];
      if (!input.trim()) return [];

      const normalizedInput = input.toLowerCase();
      const matched: MatchedSkill[] = [];

      for (const skill of skillsRef.current) {
        const matchedTriggers: string[] = [];
        let score = 0;

        for (const trigger of skill.triggers) {
          const normalizedTrigger = trigger.toLowerCase();
          if (normalizedInput.includes(normalizedTrigger)) {
            matchedTriggers.push(trigger);
            // 分数计算：触发词长度越长，分数越高（更精确的匹配）
            score += normalizedTrigger.length;
          }
        }

        if (matchedTriggers.length > 0) {
          // 加上优先级权重
          score += skill.priority / 10;
          matched.push({ skill, score, matchedTriggers });
        }
      }

      // 按分数降序排序
      return matched.sort((a, b) => b.score - a.score);
    },
    [enabled]
  );

  /**
   * 防抖匹配 Skills
   * 在用户快速输入时，只在停止输入后执行匹配，减少高频调用
   */
  const matchSkillsDebounced = useCallback(
    (input: string, callback: (results: MatchedSkill[]) => void) => {
      if (!enabled) {
        callback([]);
        return;
      }
      // 清除之前的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 设置新的定时器
      debounceTimerRef.current = setTimeout(() => {
        const results = matchSkills(input);
        callback(results);
      }, MATCH_DEBOUNCE_DELAY);
    },
    [enabled, matchSkills]
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * 根据 ID 获取 Skill
   */
  const getSkillById = useCallback((id: string): Skill | undefined => {
    return skillsRef.current.find((s) => s.id === id);
  }, []);

  const resolveSkillCandidates = useCallback(
    (input: string, explicitSkillId?: string): SkillResolverResult => {
      const explicitSkill = explicitSkillId ? getSkillById(explicitSkillId) : undefined;
      return {
        explicitSkill,
        matchedSkills: matchSkills(input),
        candidates: [
          ...(explicitSkill
            ? [{
                skill: explicitSkill,
                source: explicitSkill.source,
                score: Number.MAX_SAFE_INTEGER,
                matchedTriggers: [],
                explicit: true
              }]
            : []),
          ...matchSkills(input).map((item) => ({
            skill: item.skill,
            source: item.skill.source,
            score: item.score,
            matchedTriggers: item.matchedTriggers,
            explicit: false
          }))
        ]
      };
    },
    [getSkillById, matchSkills]
  );

  return {
    skills,
    catalog,
    marketSkills: MARKET_SKILLS,
    loading,
    error,
    matchSkills,
    matchSkillsDebounced,
    resolveSkillCandidates,
    refresh: loadSkills,
    getSkillById
  };
}
