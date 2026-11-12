import data from '../../../shared/skill-showcases.json';
import type { LocalizedText, SkillExample } from '@/services/skill-catalog-api';
export interface SkillShowcase {
  video: string;
  poster: string;
  outputs: LocalizedText[];
  inputs: LocalizedText[];
  dependencies: LocalizedText[];
  fit: LocalizedText;
  limits: LocalizedText;
  examples: SkillExample[];
}
export const skillShowcases = data as Record<string, SkillShowcase>;
export const isVideoExample = (example: SkillExample) =>
  example.mediaType === 'video' ||
  example.mediaType.startsWith('video/') ||
  /\.(mp4|webm)(?:[?#]|$)/i.test(example.mediaUrl);
