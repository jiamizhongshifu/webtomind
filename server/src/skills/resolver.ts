export interface ResolvedSkillCandidate {
  id: string;
  name: string;
  displayName: string;
  source: 'user' | 'system' | 'market';
  associatedTools: string[];
  coreInstructions?: string;
  explicit: boolean;
}

export interface ResolveSkillSelectionParams {
  prompt: string;
  explicitSkillId?: string;
  skillManager: {
    getSkillById: (skillId: string) => {
      id: string;
      name?: string;
      displayName: string;
      associatedTools?: string[];
      coreInstructions?: string;
      source?: 'user' | 'system' | 'market';
    } | undefined;
    matchSkillsData: (prompt: string) => Array<{
      id: string;
      name?: string;
      displayName: string;
      associatedTools?: string[];
      coreInstructions?: string;
      source?: 'user' | 'system' | 'market';
    }>;
  };
}

export interface SkillResolutionResult {
  explicitSkillId?: string;
  selectedPrimarySkillId?: string;
  selectedSkills: ResolvedSkillCandidate[];
  candidates: ResolvedSkillCandidate[];
}

export function resolveSkillSelection(
  params: ResolveSkillSelectionParams
): SkillResolutionResult {
  const { prompt, explicitSkillId, skillManager } = params;

  if (explicitSkillId) {
    const explicitSkill = skillManager.getSkillById(explicitSkillId);
    const selectedSkills = explicitSkill
      ? [
          {
            id: explicitSkill.id,
            name: explicitSkill.name || explicitSkill.displayName,
            displayName: explicitSkill.displayName,
            source: explicitSkill.source || 'user',
            associatedTools: explicitSkill.associatedTools || [],
            coreInstructions: explicitSkill.coreInstructions,
            explicit: true
          }
        ]
      : [];

    return {
      explicitSkillId,
      selectedPrimarySkillId: selectedSkills[0]?.id,
      selectedSkills,
      candidates: selectedSkills
    };
  }

  const matched = skillManager.matchSkillsData(prompt).map((skill) => ({
    id: skill.id,
    name: skill.name || skill.displayName,
    displayName: skill.displayName,
    source: skill.source || 'user',
    associatedTools: skill.associatedTools || [],
    coreInstructions: skill.coreInstructions,
    explicit: false
  }));

  return {
    explicitSkillId,
    selectedPrimarySkillId: matched[0]?.id,
    selectedSkills: matched,
    candidates: matched
  };
}
