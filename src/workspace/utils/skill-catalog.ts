import type { Skill } from '@/services/workspace-api';
import type { MarketSkill } from '../data/youmind-market-skills';

export type SkillCatalogSource = 'user' | 'system' | 'market';
export type SkillCatalogOriginType =
  | 'user'
  | 'system'
  | 'market'
  | 'market-installed';

export interface SkillCatalogItem {
  id: string;
  source: SkillCatalogSource;
  originType: SkillCatalogOriginType;
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  category: string;
  runtimeCategory: string;
  triggers: string[];
  priority: number;
  isActive: boolean;
  isInstalled: boolean;
  marketSkillId?: string;
  skill?: Skill;
  marketSkill?: MarketSkill;
}

export function normalizeSkillToCatalogItem(skill: Skill): SkillCatalogItem {
  const source = skill.source || 'user';
  const originType =
    skill.metadata?.originType === 'market-installed'
      ? 'market-installed'
      : source === 'system'
        ? 'system'
        : 'user';

  return {
    id: skill.id,
    source,
    originType,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    icon: skill.icon,
    category: skill.category,
    runtimeCategory: skill.category,
    triggers: skill.triggers,
    priority: skill.priority,
    isActive: skill.isActive,
    isInstalled: true,
    marketSkillId: skill.metadata?.marketSkillId,
    skill
  };
}

export function normalizeMarketSkillToCatalogItem(
  marketSkill: MarketSkill,
  options: { isInstalled?: boolean } = {}
): SkillCatalogItem {
  return {
    id: marketSkill.id,
    source: 'market',
    originType: 'market',
    name: marketSkill.name,
    displayName: marketSkill.name,
    description: marketSkill.description,
    icon: '✨',
    category: marketSkill.category,
    runtimeCategory: 'market',
    triggers: [],
    priority: 0,
    isActive: false,
    isInstalled: options.isInstalled ?? false,
    marketSkillId: marketSkill.id,
    marketSkill
  };
}
