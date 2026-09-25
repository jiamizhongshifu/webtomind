import type {
  ImageCharacterReferenceGroup,
  SanitizedImageGenerateRequest
} from './types.js';

function buildCharacterConsistencyContract(
  groups: ImageCharacterReferenceGroup[]
): string {
  if (groups.length === 0) return '';
  const groupLines = groups.map((group, index) => {
    const label =
      group.label || (index === 0 ? 'Character A' : `Character ${index + 1}`);
    const alias = index === 0 ? 'Character A' : 'Character B';
    const description = group.description ? ` ${group.description}` : '';
    return `- ${alias}: ${label}.${description} Use only this character group's ${group.referenceImageIds.length} reference image(s) as identity anchors.`;
  });

  return [
    'Character consistency contract:',
    ...groupLines,
    'Keep face identity, hair shape, body proportions, outfit identity and distinctive details stable across the generated scene.',
    'If multiple characters are present, keep Character A and Character B visually separate. Do not merge, swap, average or blend their facial features, clothing, hairstyle or body traits.',
    'Use the text prompt only to change scene, pose, camera, lighting and composition unless it explicitly overrides non-identity styling.'
  ].join('\n');
}

function buildMoodboardConditioningContract(
  input: SanitizedImageGenerateRequest
): string {
  const moodboard = input.creationContext?.moodboard;
  if (!moodboard) return '';

  return [
    'Moodboard visual direction:',
    moodboard.tasteProfile,
    moodboard.keywords.length > 0
      ? `Visual keywords: ${moodboard.keywords.join(', ')}.`
      : '',
    ...moodboard.guidelines.map((item) => `- ${item}`),
    moodboard.avoids.length > 0
      ? `Avoid from moodboard: ${moodboard.avoids.join(', ')}.`
      : '',
    'Use the moodboard as shared visual context. Preserve the user prompt subject and intent; do not copy any single reference image.'
  ]
    .filter(Boolean)
    .join('\n');
}

const IMAGE_POLICY_RISK_TERMS = [
  /泳装|泳衣|比基尼|内衣|吊带|透视|透明|半透明|露出|裸|性感|撩人|诱惑|擦边|湿身|湿润|身体轮廓|胸|臀|大腿|锁骨|沟|身材比例/i,
  /swimsuit|bikini|lingerie|underwear|transparent|translucent|see[-\s]?through|revealing|nude|nudity|sexy|sensual|erotic|wet skin|cleavage|breast|hips?|thigh/i
];

export function getImagePromptSafetyGuidance(
  input: SanitizedImageGenerateRequest
): string {
  const combined = `${input.prompt}\n${input.negativePrompt || ''}`;
  const riskHits = IMAGE_POLICY_RISK_TERMS.reduce(
    (count, pattern) => count + (pattern.test(combined) ? 1 : 0),
    0
  );
  if (riskHits === 0) return '';
  return [
    'Safety framing:',
    'Keep the result as a modest fashion/editorial image with complete, opaque clothing.',
    'Avoid exposing private body areas, see-through clothing over the body, suggestive posing, and camera emphasis on chest, hips, thighs, or skin texture.',
    'Prioritize outfit design, character identity, composition, lighting, and environment.'
  ].join(' ');
}

export function buildGenerationPrompt(
  input: SanitizedImageGenerateRequest
): string {
  const characterContract = buildCharacterConsistencyContract(
    input.characterReferenceGroups
  );
  const moodboardContract = buildMoodboardConditioningContract(input);
  const negativePrompt = input.negativePrompt?.trim();
  const safetyGuidance = getImagePromptSafetyGuidance(input);
  const promptConstraints = [
    negativePrompt ? `Avoid: ${negativePrompt}` : '',
    safetyGuidance
  ].filter(Boolean);
  if (input.promptMode === 'custom') {
    return [
      input.prompt,
      moodboardContract,
      characterContract,
      ...promptConstraints
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  const imageSizeText =
    input.imageSize === 'auto'
      ? 'Image size: auto'
      : `Image size: ${input.imageSize} (${input.aspectRatio})`;
  const constraints = [
    imageSizeText,
    `Target quality profile: ${input.qualityLabel}`,
    ...promptConstraints
  ].filter(Boolean);

  return [input.prompt, moodboardContract, characterContract, ...constraints]
    .filter(Boolean)
    .join('\n\n');
}
