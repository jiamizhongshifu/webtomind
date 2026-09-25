import { describe, expect, it } from 'vitest';
import { analyzeComfyWorkflow } from '../comfy-workflow-checker';

describe('ComfyUI workflow checker', () => {
  it('extracts models, prompts, and dimensions from API workflows', () => {
    const result = analyzeComfyWorkflow({
      '3': {
        class_type: 'KSampler',
        inputs: {
          positive: ['6', 0],
          negative: ['7', 0],
          latent_image: ['5', 0]
        }
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' }
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: { width: 1024, height: 1536, batch_size: 2 }
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'cinematic product photo, warm light' }
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'low quality, blurry' }
      },
      '8': {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: 'brand-style.safetensors',
          strength_model: 0.75
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.workflowType).toBe('api');
    expect(result.analysis.nodeCount).toBe(6);
    expect(result.analysis.checkpoints[0]?.name).toBe(
      'sd_xl_base_1.0.safetensors'
    );
    expect(result.analysis.loras[0]).toMatchObject({
      name: 'brand-style.safetensors',
      strength: 0.75
    });
    expect(result.analysis.positivePrompt).toBe(
      'cinematic product photo, warm light'
    );
    expect(result.analysis.negativePrompt).toBe('low quality, blurry');
    expect(result.analysis.width).toBe(1024);
    expect(result.analysis.height).toBe(1536);
    expect(result.analysis.batchSize).toBe(2);
    expect(result.analysis.riskLevel).toBe('low');
    expect(result.analysis.riskScore).toBeLessThan(25);
    expect(
      result.analysis.actionBuckets.some(
        (action) => action.bucket === 'portable'
      )
    ).toBe(true);
  });

  it('extracts UI workflow widgets and flags custom nodes', () => {
    const result = analyzeComfyWorkflow(
      JSON.stringify({
        nodes: [
          {
            id: 1,
            type: 'CheckpointLoaderSimple',
            widgets_values: ['realvisxl.safetensors']
          },
          {
            id: 2,
            type: 'CLIPTextEncode',
            title: 'Positive Prompt',
            widgets_values: ['portrait, soft rim light']
          },
          {
            id: 3,
            type: 'CLIPTextEncode',
            title: 'Negative Prompt',
            widgets_values: ['bad hands']
          },
          {
            id: 4,
            type: 'ImpactWildcardEncode',
            widgets_values: ['custom node payload']
          }
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.workflowType).toBe('ui');
    expect(result.analysis.checkpoints[0]?.name).toBe('realvisxl.safetensors');
    expect(result.analysis.positivePrompt).toBe('portrait, soft rim light');
    expect(result.analysis.negativePrompt).toBe('bad hands');
    expect(result.analysis.customNodes).toEqual(['ImpactWildcardEncode']);
    expect(
      result.analysis.risks.some((risk) => risk.code === 'custom_node')
    ).toBe(true);
    expect(result.analysis.riskLevel).toBe('medium');
    expect(
      result.analysis.actionBuckets.some(
        (action) => action.bucket === 'manual_fix'
      )
    ).toBe(true);
    expect(result.analysis.migrationHints.join('\n')).toContain('Custom nodes');
  });

  it('returns a structured error for bad JSON', () => {
    const result = analyzeComfyWorkflow('{bad json');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Invalid JSON');
  });

  it('warns when a workflow has no checkpoint', () => {
    const result = analyzeComfyWorkflow({
      '1': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'prompt without model' }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.analysis.risks.some((risk) => risk.code === 'missing_checkpoint')
    ).toBe(true);
    expect(result.analysis.riskLevel).toBe('high');
    expect(
      result.analysis.actionBuckets.some(
        (action) => action.bucket === 'high_risk'
      )
    ).toBe(true);
  });
});
