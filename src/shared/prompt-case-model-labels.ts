const PROMPT_CASE_MODEL_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  flux: 'Flux',
  grok: 'Grok',
  'grok-imagine': 'Grok Imagine',
  'gpt-image-2': 'GPT Image 2',
  midjourney: 'Midjourney',
  'nano-banana': 'Nano Banana',
  'seedance-2-0': 'Seedance 2.0',
  seedream: 'Seedream'
};

export function getPromptCaseModelLabel(model?: string | null): string {
  const value = String(model || '').trim();
  if (!value) return '';
  return PROMPT_CASE_MODEL_LABELS[value.toLowerCase()] || value;
}
