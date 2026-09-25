// Open-source build: the imported third-party skill catalog is not
// redistributed. Add skills you own or are licensed to publish.

export interface MarketSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  prompt: string;
  badgeColor: string;
  coverImages?: string[];
}

export const MARKET_SKILLS: MarketSkill[] = [];

export async function loadMarketSkillPrompt(id: string): Promise<string> {
  return MARKET_SKILLS.find((skill) => skill.id === id)?.prompt ?? '';
}

export async function hydrateMarketSkillPrompt(
  skill: MarketSkill
): Promise<MarketSkill> {
  if (skill.prompt) return skill;
  return { ...skill, prompt: await loadMarketSkillPrompt(skill.id) };
}
