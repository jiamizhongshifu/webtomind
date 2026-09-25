import type { Skill } from '@/services/workspace-api';

export interface SkillResolverCandidate {
  skill: Skill;
  source: Skill['source'];
  score: number;
  matchedTriggers: string[];
  explicit: boolean;
}

export interface SkillResolverResult {
  explicitSkill?: Skill;
  matchedSkills: Array<{
    skill: Skill;
    score: number;
    matchedTriggers: string[];
  }>;
  candidates: SkillResolverCandidate[];
}
