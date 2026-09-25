export type ComfyWorkflowType = 'api' | 'ui' | 'unknown';

export type ComfyModelKind =
  | 'checkpoint'
  | 'lora'
  | 'vae'
  | 'controlnet'
  | 'upscale';

export interface ComfyModelReference {
  kind: ComfyModelKind;
  name: string;
  nodeId?: string;
  nodeType?: string;
  strength?: number;
}

export interface ComfyWorkflowRisk {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  nodeId?: string;
  nodeType?: string;
}

export type ComfyMigrationActionBucket =
  | 'portable'
  | 'manual_fix'
  | 'high_risk';

export interface ComfyMigrationAction {
  bucket: ComfyMigrationActionBucket;
  label: string;
  detail: string;
  relatedRiskCodes: string[];
}

export interface ComfyWorkflowAnalysis {
  workflowType: ComfyWorkflowType;
  nodeCount: number;
  checkpoints: ComfyModelReference[];
  loras: ComfyModelReference[];
  vaes: ComfyModelReference[];
  controlNets: ComfyModelReference[];
  upscaleModels: ComfyModelReference[];
  customNodes: string[];
  positivePrompt: string;
  negativePrompt: string;
  width?: number;
  height?: number;
  batchSize?: number;
  risks: ComfyWorkflowRisk[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  migrationHints: string[];
  actionBuckets: ComfyMigrationAction[];
  repairSteps: string[];
  webToMindPrompt: string;
  webToMindNegativePrompt: string;
  summaryLines: string[];
}

export type ComfyWorkflowCheckerResult =
  | { ok: true; analysis: ComfyWorkflowAnalysis }
  | { ok: false; error: string };

interface NormalizedNode {
  id: string;
  type: string;
  inputs: Record<string, unknown>;
  widgets: unknown[];
  title?: string;
}

const KNOWN_NODE_TYPES = new Set([
  'CheckpointLoader',
  'CheckpointLoaderSimple',
  'CheckpointLoaderSimpleWithNoiseSelect',
  'LoraLoader',
  'LoraLoaderModelOnly',
  'VAELoader',
  'CLIPTextEncode',
  'CLIPSetLastLayer',
  'KSampler',
  'KSamplerAdvanced',
  'SamplerCustom',
  'SamplerCustomAdvanced',
  'EmptyLatentImage',
  'VAEEncode',
  'VAEDecode',
  'SaveImage',
  'PreviewImage',
  'LoadImage',
  'ImageScale',
  'ImageScaleBy',
  'ImageUpscaleWithModel',
  'UpscaleModelLoader',
  'ControlNetLoader',
  'ControlNetApply',
  'ControlNetApplyAdvanced',
  'ConditioningSetArea',
  'ConditioningCombine',
  'ConditioningAverage',
  'ConditioningConcat',
  'ImageInvert',
  'ImageBlur',
  'ImageSharpen',
  'ImageCrop',
  'ImagePadForOutpaint',
  'LoadImageMask',
  'SetLatentNoiseMask'
]);

const MODEL_DIRS: Record<ComfyModelKind, string> = {
  checkpoint: 'ComfyUI/models/checkpoints/',
  lora: 'ComfyUI/models/loras/',
  vae: 'ComfyUI/models/vae/',
  controlnet: 'ComfyUI/models/controlnet/',
  upscale: 'ComfyUI/models/upscale_models/'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isConnection(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number'
  );
}

function getConnectedNodeId(value: unknown): string | null {
  return isConnection(value) ? String(value[0]) : null;
}

function normalizeNode(id: string, raw: unknown): NormalizedNode | null {
  if (!isRecord(raw)) return null;
  const type =
    stringifyValue(raw.class_type) ||
    stringifyValue(raw.type) ||
    stringifyValue(raw.name);
  if (!type) return null;
  const inputs = isRecord(raw.inputs) ? raw.inputs : {};
  const widgets = Array.isArray(raw.widgets_values)
    ? raw.widgets_values
    : Array.isArray(raw.widgets)
      ? raw.widgets
      : [];
  const meta = isRecord(raw._meta) ? raw._meta : {};
  const title = stringifyValue(raw.title) || stringifyValue(meta.title);
  return { id, type, inputs, widgets, title };
}

function normalizeApiWorkflow(workflow: Record<string, unknown>) {
  const nodes = Object.entries(workflow)
    .map(([id, node]) => normalizeNode(id, node))
    .filter((node): node is NormalizedNode => Boolean(node));
  return nodes.length > 0 ? nodes : null;
}

function normalizeUiWorkflow(workflow: Record<string, unknown>) {
  const rawNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const nodes = rawNodes
    .map((node, index) => {
      if (!isRecord(node)) return null;
      const id = stringifyValue(node.id) || String(index);
      return normalizeNode(id, node);
    })
    .filter((node): node is NormalizedNode => Boolean(node));
  return nodes.length > 0 ? nodes : null;
}

function detectWorkflowType(parsed: unknown): {
  type: ComfyWorkflowType;
  nodes: NormalizedNode[];
} {
  if (!isRecord(parsed)) {
    return { type: 'unknown', nodes: [] };
  }

  const uiNodes = normalizeUiWorkflow(parsed);
  if (uiNodes) {
    return { type: 'ui', nodes: uiNodes };
  }

  const apiNodes = normalizeApiWorkflow(parsed);
  if (apiNodes) {
    return { type: 'api', nodes: apiNodes };
  }

  return { type: 'unknown', nodes: [] };
}

function addModel(
  bucket: ComfyModelReference[],
  kind: ComfyModelKind,
  node: NormalizedNode,
  name: unknown,
  strength?: unknown
) {
  const modelName = stringifyValue(name);
  if (!modelName) return;
  bucket.push({
    kind,
    name: modelName,
    nodeId: node.id,
    nodeType: node.type,
    strength: getNumber(strength)
  });
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    const text = stringifyValue(value);
    if (text) return text;
  }
  return '';
}

function extractModels(nodes: NormalizedNode[]) {
  const checkpoints: ComfyModelReference[] = [];
  const loras: ComfyModelReference[] = [];
  const vaes: ComfyModelReference[] = [];
  const controlNets: ComfyModelReference[] = [];
  const upscaleModels: ComfyModelReference[] = [];

  for (const node of nodes) {
    const type = node.type.toLowerCase();
    if (type.includes('checkpoint')) {
      addModel(
        checkpoints,
        'checkpoint',
        node,
        node.inputs.ckpt_name ?? firstString(node.widgets)
      );
    }
    if (type.includes('lora')) {
      addModel(
        loras,
        'lora',
        node,
        node.inputs.lora_name ?? firstString(node.widgets),
        node.inputs.strength_model ??
          node.inputs.strength_clip ??
          node.widgets[1]
      );
    }
    if (type.includes('vae') && type.includes('loader')) {
      addModel(
        vaes,
        'vae',
        node,
        node.inputs.vae_name ?? firstString(node.widgets)
      );
    }
    if (type.includes('controlnet')) {
      addModel(
        controlNets,
        'controlnet',
        node,
        node.inputs.control_net_name ?? firstString(node.widgets)
      );
    }
    if (type.includes('upscale') && type.includes('loader')) {
      addModel(
        upscaleModels,
        'upscale',
        node,
        node.inputs.model_name ?? firstString(node.widgets)
      );
    }
  }

  return { checkpoints, loras, vaes, controlNets, upscaleModels };
}

function getTextEncodePrompt(node: NormalizedNode | undefined): string {
  if (!node) return '';
  const inputText = stringifyValue(node.inputs.text);
  if (inputText) return inputText;
  return firstString(node.widgets);
}

function extractApiPrompts(nodes: NormalizedNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const sampler = nodes.find((node) =>
    node.type.toLowerCase().includes('sampler')
  );
  const positiveId = sampler
    ? getConnectedNodeId(sampler.inputs.positive)
    : null;
  const negativeId = sampler
    ? getConnectedNodeId(sampler.inputs.negative)
    : null;
  const positivePrompt = getTextEncodePrompt(
    positiveId ? nodeMap.get(positiveId) : undefined
  );
  const negativePrompt = getTextEncodePrompt(
    negativeId ? nodeMap.get(negativeId) : undefined
  );
  if (positivePrompt || negativePrompt) {
    return { positivePrompt, negativePrompt };
  }

  const textNodes = nodes
    .filter((node) => node.type === 'CLIPTextEncode')
    .map(getTextEncodePrompt)
    .filter(Boolean);
  return {
    positivePrompt: textNodes[0] || '',
    negativePrompt: textNodes[1] || ''
  };
}

function extractUiPrompts(nodes: NormalizedNode[]) {
  const textNodes = nodes
    .filter((node) => node.type === 'CLIPTextEncode')
    .map((node) => ({
      label: `${node.title || ''} ${node.id}`.toLowerCase(),
      text: getTextEncodePrompt(node)
    }))
    .filter((node) => node.text);
  const negative = textNodes.find((node) => node.label.includes('negative'));
  const positive = textNodes.find((node) => node.label.includes('positive'));
  return {
    positivePrompt:
      positive?.text ||
      textNodes.find((node) => node !== negative)?.text ||
      textNodes[0]?.text ||
      '',
    negativePrompt:
      negative?.text || (textNodes.length > 1 ? textNodes[1]?.text || '' : '')
  };
}

function extractDimensions(nodes: NormalizedNode[]) {
  const latent = nodes.find((node) => node.type === 'EmptyLatentImage');
  if (!latent) return {};
  return {
    width: getNumber(latent.inputs.width ?? latent.widgets[0]),
    height: getNumber(latent.inputs.height ?? latent.widgets[1]),
    batchSize: getNumber(latent.inputs.batch_size ?? latent.widgets[2])
  };
}

function getCustomNodes(nodes: NormalizedNode[]) {
  return unique(
    nodes
      .filter((node) => !KNOWN_NODE_TYPES.has(node.type))
      .map((node) => node.type)
  );
}

function hasPathRisk(name: string) {
  return /(^\/|^[a-z]:\\|^[a-z]:\/|\\|\/)/i.test(name);
}

function collectRisks(
  analysis: Pick<
    ComfyWorkflowAnalysis,
    | 'checkpoints'
    | 'loras'
    | 'vaes'
    | 'controlNets'
    | 'upscaleModels'
    | 'customNodes'
    | 'positivePrompt'
    | 'width'
    | 'height'
  >
): ComfyWorkflowRisk[] {
  const risks: ComfyWorkflowRisk[] = [];
  if (analysis.checkpoints.length === 0) {
    risks.push({
      code: 'missing_checkpoint',
      severity: 'error',
      message:
        'No checkpoint loader was detected. Confirm the workflow includes a base model.'
    });
  }
  if (!analysis.positivePrompt.trim()) {
    risks.push({
      code: 'missing_prompt',
      severity: 'error',
      message: 'No positive prompt was detected.'
    });
  }
  for (const customNode of analysis.customNodes) {
    risks.push({
      code: 'custom_node',
      severity: 'warning',
      message: `Custom node required: ${customNode}`,
      nodeType: customNode
    });
  }
  for (const model of [
    ...analysis.checkpoints,
    ...analysis.loras,
    ...analysis.vaes,
    ...analysis.controlNets,
    ...analysis.upscaleModels
  ]) {
    if (hasPathRisk(model.name)) {
      risks.push({
        code: 'path_sensitive_model',
        severity: 'info',
        message: `Model path may not exist on another machine: ${model.name}`,
        nodeId: model.nodeId,
        nodeType: model.nodeType
      });
    }
  }
  if (
    typeof analysis.width === 'number' &&
    typeof analysis.height === 'number' &&
    (analysis.width > 2048 || analysis.height > 2048)
  ) {
    risks.push({
      code: 'large_resolution',
      severity: 'info',
      message: `Large latent size detected: ${analysis.width}x${analysis.height}. Expect higher VRAM usage.`
    });
  }
  return risks;
}

function buildRepairSteps(
  models: {
    checkpoints: ComfyModelReference[];
    loras: ComfyModelReference[];
    vaes: ComfyModelReference[];
    controlNets: ComfyModelReference[];
    upscaleModels: ComfyModelReference[];
  },
  customNodes: string[]
) {
  const modelRefs = [
    ...models.checkpoints,
    ...models.loras,
    ...models.vaes,
    ...models.controlNets,
    ...models.upscaleModels
  ];
  const steps = modelRefs.map(
    (model) => `Place ${model.name} in ${MODEL_DIRS[model.kind]}`
  );
  for (const node of customNodes) {
    steps.push(
      `Install or enable the custom node package that provides ${node}`
    );
  }
  if (steps.length === 0) {
    steps.push(
      'No missing model or custom-node clue was detected in this JSON.'
    );
  }
  return steps;
}

function getRiskScore(risks: ComfyWorkflowRisk[]) {
  const score = risks.reduce((total, risk) => {
    if (risk.severity === 'error') return total + 60;
    if (risk.severity === 'warning') return total + 30;
    return total + 8;
  }, 0);
  return Math.max(0, Math.min(100, score));
}

function getRiskLevel(score: number): ComfyWorkflowAnalysis['riskLevel'] {
  if (score >= 60) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function buildMigrationHints(
  analysis: Pick<
    ComfyWorkflowAnalysis,
    | 'checkpoints'
    | 'loras'
    | 'vaes'
    | 'controlNets'
    | 'upscaleModels'
    | 'customNodes'
    | 'positivePrompt'
    | 'width'
    | 'height'
    | 'batchSize'
  >,
  risks: ComfyWorkflowRisk[]
): string[] {
  const hints: string[] = [];
  const hasModels =
    analysis.checkpoints.length +
      analysis.loras.length +
      analysis.vaes.length +
      analysis.controlNets.length +
      analysis.upscaleModels.length >
    0;

  if (analysis.positivePrompt.trim()) {
    hints.push('Prompt can be migrated directly into WebToMind custom mode.');
  }
  if (hasModels) {
    hints.push(
      'Model names were detected; verify each file exists in the target ComfyUI model folders before updating.'
    );
  }
  if (analysis.customNodes.length > 0) {
    hints.push(
      'Custom nodes should be installed or replaced before opening this workflow on a fresh ComfyUI setup.'
    );
  }
  if (
    typeof analysis.width === 'number' &&
    typeof analysis.height === 'number'
  ) {
    hints.push(
      `The workflow canvas is ${analysis.width}x${analysis.height}${
        analysis.batchSize ? ` with batch ${analysis.batchSize}` : ''
      }; lower it first if your update target has less VRAM.`
    );
  }
  if (risks.some((risk) => risk.code === 'path_sensitive_model')) {
    hints.push(
      'Absolute or nested model paths were found; prefer bare model filenames for cross-machine migration.'
    );
  }
  if (hints.length === 0) {
    hints.push('No major migration blocker was detected from this JSON.');
  }
  return hints;
}

function buildActionBuckets(
  analysis: Pick<ComfyWorkflowAnalysis, 'positivePrompt' | 'customNodes'>,
  risks: ComfyWorkflowRisk[]
): ComfyMigrationAction[] {
  const actions: ComfyMigrationAction[] = [];
  const hasError = risks.some((risk) => risk.severity === 'error');
  const customNodeRisks = risks.filter((risk) => risk.code === 'custom_node');
  const modelPathRisks = risks.filter(
    (risk) => risk.code === 'path_sensitive_model'
  );
  const largeResolutionRisks = risks.filter(
    (risk) => risk.code === 'large_resolution'
  );

  if (analysis.positivePrompt.trim()) {
    actions.push({
      bucket: 'portable',
      label: 'Use prompt in WebToMind',
      detail:
        'The positive and negative prompts can be copied into WebToMind without requiring local ComfyUI nodes.',
      relatedRiskCodes: []
    });
  }

  if (customNodeRisks.length > 0) {
    actions.push({
      bucket: 'manual_fix',
      label: 'Install custom nodes first',
      detail: `Install or replace ${analysis.customNodes.join(', ')} before opening the workflow after an update.`,
      relatedRiskCodes: customNodeRisks.map((risk) => risk.code)
    });
  }

  if (modelPathRisks.length > 0) {
    actions.push({
      bucket: 'manual_fix',
      label: 'Normalize model paths',
      detail:
        'Move model files into standard ComfyUI model folders and update workflow references to portable filenames.',
      relatedRiskCodes: modelPathRisks.map((risk) => risk.code)
    });
  }

  if (largeResolutionRisks.length > 0) {
    actions.push({
      bucket: 'manual_fix',
      label: 'Reduce size before migration',
      detail:
        'Large latent sizes can fail after an update or on weaker GPUs; test a smaller size first.',
      relatedRiskCodes: largeResolutionRisks.map((risk) => risk.code)
    });
  }

  if (hasError) {
    actions.push({
      bucket: 'high_risk',
      label: 'Do not update blindly',
      detail:
        'The workflow is missing a base model or prompt. Keep a backup and fix these blockers before relying on it.',
      relatedRiskCodes: risks
        .filter((risk) => risk.severity === 'error')
        .map((risk) => risk.code)
    });
  }

  if (actions.length === 0) {
    actions.push({
      bucket: 'portable',
      label: 'Low-risk migration',
      detail:
        'No major blocker was detected. Save a backup, then test the workflow after updating ComfyUI.',
      relatedRiskCodes: []
    });
  }

  return actions;
}

function buildSummaryLines(analysis: ComfyWorkflowAnalysis) {
  const lines = [
    `Workflow type: ${analysis.workflowType}`,
    `Nodes: ${analysis.nodeCount}`,
    `Migration risk: ${analysis.riskLevel} (${analysis.riskScore}/100)`
  ];
  if (analysis.checkpoints.length > 0) {
    lines.push(
      `Checkpoints: ${analysis.checkpoints.map((model) => model.name).join(', ')}`
    );
  }
  if (analysis.loras.length > 0) {
    lines.push(`LoRA: ${analysis.loras.map((model) => model.name).join(', ')}`);
  }
  if (analysis.vaes.length > 0) {
    lines.push(`VAE: ${analysis.vaes.map((model) => model.name).join(', ')}`);
  }
  if (analysis.controlNets.length > 0) {
    lines.push(
      `ControlNet: ${analysis.controlNets.map((model) => model.name).join(', ')}`
    );
  }
  if (analysis.upscaleModels.length > 0) {
    lines.push(
      `Upscale: ${analysis.upscaleModels.map((model) => model.name).join(', ')}`
    );
  }
  if (analysis.width && analysis.height) {
    lines.push(
      `Canvas: ${analysis.width}x${analysis.height}${
        analysis.batchSize ? ` batch ${analysis.batchSize}` : ''
      }`
    );
  }
  if (analysis.customNodes.length > 0) {
    lines.push(`Custom nodes: ${analysis.customNodes.join(', ')}`);
  }
  if (analysis.risks.length > 0) {
    lines.push(
      `Risks: ${analysis.risks.map((risk) => risk.message).join(' | ')}`
    );
  }
  return lines;
}

export function analyzeComfyWorkflow(
  input: string | unknown
): ComfyWorkflowCheckerResult {
  let parsed: unknown;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return {
        ok: false,
        error: 'Invalid JSON. Upload or paste a ComfyUI workflow file.'
      };
    }
  } else {
    parsed = input;
  }

  const { type, nodes } = detectWorkflowType(parsed);
  if (nodes.length === 0) {
    return {
      ok: false,
      error:
        'No ComfyUI nodes were found. Use an API workflow object or a UI workflow with nodes[].'
    };
  }

  const models = extractModels(nodes);
  const customNodes = getCustomNodes(nodes);
  const prompts =
    type === 'ui' ? extractUiPrompts(nodes) : extractApiPrompts(nodes);
  const dimensions = extractDimensions(nodes);
  const partialAnalysis = {
    ...models,
    customNodes,
    positivePrompt: prompts.positivePrompt,
    width: dimensions.width,
    height: dimensions.height
  };
  const risks = collectRisks(partialAnalysis);
  const riskScore = getRiskScore(risks);
  const riskLevel = getRiskLevel(riskScore);
  const migrationHints = buildMigrationHints(
    {
      ...models,
      customNodes,
      positivePrompt: prompts.positivePrompt,
      width: dimensions.width,
      height: dimensions.height,
      batchSize: dimensions.batchSize
    },
    risks
  );
  const actionBuckets = buildActionBuckets(
    { positivePrompt: prompts.positivePrompt, customNodes },
    risks
  );
  const repairSteps = buildRepairSteps(models, customNodes);
  const analysis: ComfyWorkflowAnalysis = {
    workflowType: type,
    nodeCount: nodes.length,
    ...models,
    customNodes,
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    ...dimensions,
    risks,
    riskScore,
    riskLevel,
    migrationHints,
    actionBuckets,
    repairSteps,
    webToMindPrompt: prompts.positivePrompt,
    webToMindNegativePrompt: prompts.negativePrompt,
    summaryLines: []
  };
  analysis.summaryLines = buildSummaryLines(analysis);
  return { ok: true, analysis };
}
