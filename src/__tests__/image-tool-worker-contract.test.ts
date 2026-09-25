import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GPT_IMAGE_2_DENOISE_CREDIT_COST,
  GPT_IMAGE_2_DENOISE_RESTORATION_CREDIT_COST,
  GPT_IMAGE_2_DENOISE_STRUCTURE_CREDIT_COST
} from '../shared/gpt-image-2-denoise';

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('image tool Worker contracts', () => {
  it('serves verified model assets with range and immutable cache headers', () => {
    const worker = source('workers/webtomind.ts');
    expect(worker).toContain("pathname.startsWith('/models/image-tools/')");
    expect(worker).toContain("'Accept-Ranges': 'bytes'");
    expect(worker).toContain(
      "'Cache-Control': 'public, max-age=31536000, immutable'"
    );
    expect(worker).toContain("'X-Model-SHA256': model.sha256");
    expect(worker).toContain('status: range ? 206 : 200');
    expect(worker).toContain("? 'application/wasm'");
    expect(worker).toContain("? 'text/javascript; charset=utf-8'");
    expect(source('src/workers/image-ai.worker.ts')).toContain(
      "mjs: IMAGE_TOOL_MODELS['ort-webgpu-module'].route"
    );
    expect(source('src/workers/image-ai.worker.ts')).toContain(
      "executionProviders: ['webgpu']"
    );
    expect(source('src/workers/image-ai.worker.ts')).toContain(
      'await loadImageModel('
    );
    expect(source('src/shared/image-model-cache.ts')).toContain(
      '正在读取本地模型缓存'
    );
    expect(source('src/workers/image-inpaint.worker.ts')).toContain(
      "engine = 'LaMa · ONNX WebGPU'"
    );
    expect(source('src/workers/image-inpaint.worker.ts')).toContain(
      'compositeMaskedPixels'
    );
  });

  it('binds result downloads to source, settings, and real MIME metadata', () => {
    const utilities = source('src/web/lib/image-tools.ts');
    const splitter = source('src/web/pages/ImageSplitterPage.tsx');
    const remover = source('src/web/pages/WatermarkRemoverPage.tsx');
    const denoiser = source('src/web/pages/GptImage2DenoiserPage.tsx');
    const compressor = source('src/web/pages/ImageCompressorPage.tsx');
    expect(utilities).toContain('createImageToolResultIdentity');
    expect(splitter).toContain('result?.identity === resultIdentity');
    expect(splitter).toContain('currentResult.sourceName');
    expect(remover).toContain('currentResult.outputFormat');
    expect(denoiser).toContain('currentResult.outputFormat');
    expect(denoiser).toContain('currentResult.storedInLibrary');
    expect(compressor).toContain('currentResult.outputFormat');
    expect(compressor).toContain('currentResult.sourceBytes');
  });

  it('reports target-size misses and bounds long-running local workers', () => {
    const compressWorker = source('src/workers/image-compress.worker.ts');
    const compressor = source('src/web/pages/ImageCompressorPage.tsx');
    const remover = source('src/web/hooks/useInpaintWorker.ts');
    const denoiser = source('src/web/pages/GptImage2DenoiserPage.tsx');
    expect(compressWorker).toContain('targetMet');
    expect(compressWorker).toContain('encoded.blob.size > targetBytes');
    expect(compressor).toContain('未达到目标大小');
    expect(remover).toContain('120_000');
    expect(remover).toContain('startWorker(false)');
    expect(denoiser).toContain('240_000');
  });

  it('uses 301 redirects and preserves acquisition query parameters', () => {
    const worker = source('workers/webtomind.ts');
    expect(worker).toContain("['image-upscaler', '/tools/image-upscaler']");
    expect(worker).toContain("['object-remover', '/tools/watermark-remover']");
    expect(worker).toContain(
      'return redirectTo(request, legacyCreateAppRedirect, 301);'
    );
    expect(worker).toContain("'source',");
    expect(worker).toContain("key.startsWith('utm_')");
  });

  it('locks cloud denoise to 100 credits and a deterministic-guide Nano Banana 2 restoration', () => {
    const api = source('api/image/generate.ts');
    const denoise = source('api/image/generate/cloud-denoise.ts');
    const walletMigration = source(
      'supabase/migrations/20260817120000_align_nano_banana_2_denoise_credits.sql'
    );
    expect(GPT_IMAGE_2_DENOISE_STRUCTURE_CREDIT_COST).toBe(0);
    expect(GPT_IMAGE_2_DENOISE_RESTORATION_CREDIT_COST).toBe(100);
    expect(GPT_IMAGE_2_DENOISE_CREDIT_COST).toBe(100);
    expect(denoise).toContain('const CLOUD_DENOISE_GUIDE_TRANSFORM');
    expect(denoise).toContain("format: 'image/webp'");
    expect(denoise).toContain('quality: 72');
    expect(denoise).toContain('const CLOUD_DENOISE_BASE_PROMPT');
    expect(denoise).toContain("const CLOUD_DENOISE_MODEL = 'nano-banana-2'");
    expect(denoise).toContain("'gemini-3.1-flash-image-preview' as const");
    expect(api).toContain("phase: 'denoise_dual_reference_restore'");
    expect(api).toContain("guideMode: 'deterministic_cloudflare_images_v1'");
    expect(api).toContain("referenceOrder: ['original', 'structure_guide']");
    expect(api).toContain('`${apiBaseUrl}/v1/images/generations`');
    expect(api).toContain('getTuziImageTransport(');
    expect(api).toContain("'tuzi_images_generations_json'");
    expect(api).toContain('image: references.map((reference) => reference.signedUrl)');
    expect(api).toContain('isCloudDenoiseInput(sanitizedInput) ||');
    expect(api).toContain('if (options.cloudDenoiseTask)');
    expect(denoise).toContain(
      'The FIRST uploaded image is ORIGINAL_REFERENCE'
    );
    expect(denoise).toContain(
      'The SECOND uploaded image is STRUCTURE_GUIDE'
    );
    expect(denoise).toContain('FINAL OUTPUT CHECK');
    expect(denoise).toContain(
      "const CLOUD_DENOISE_APP_OPERATION = 'gpt-image-2-denoise'"
    );
    expect(api).toContain("provider: 'tuzi'");
    expect(api).toContain('getImageSizeForSourceDimensions(');
    expect(api).toContain("quality: 'auto'");
    expect(api).toContain('sourceWidth');
    expect(api).toContain('sourceHeight');
    expect(api).toContain('dynamicCredits: GPT_IMAGE_2_DENOISE_CREDIT_COST');
    expect(api).toContain('imageCount: 1');
    expect(api).toContain('referenceImageIds: [referenceId]');
    expect(api).toContain("'consume_gpt_image_2_denoise_credits_v3'");
    expect(api).toContain("metadata.appOperation === 'gpt-image-2-denoise'");
    expect(api).toContain('`denoise_task:${metadata.taskId}:refund`');
    expect(api).toContain("'refund_gpt_image_2_denoise_credits_v3'");
    expect(api).toContain("result.error === 'INSUFFICIENT_CREDITS'");
    expect(walletMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.consume_gpt_image_2_denoise_credits_v3'
    );
    expect(walletMigration).toContain(
      'v_cost CONSTANT INTEGER := 100;'
    );
    expect(walletMigration).toContain(
      'p_amount IS NULL OR p_amount <> 100'
    );
    expect(walletMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.refund_gpt_image_2_denoise_credits_v3'
    );
    expect(walletMigration).toContain(
      'amount,\n    balance_after,\n    source,'
    );
    expect(walletMigration).toContain("'gpt_image_2_denoise'");
    expect(walletMigration).toContain(
      'total_consumed = COALESCE(total_consumed, 0) + v_cost'
    );
    expect(walletMigration).toContain('v_promo_media_deduct := LEAST');
    expect(walletMigration).toContain('v_media_deduct := LEAST');
    expect(walletMigration).toContain('v_subscription_deduct := LEAST');
    expect(walletMigration).toContain('v_bonus_deduct := LEAST');
    expect(walletMigration).not.toContain('v_referral_deduct := LEAST');
    expect(walletMigration).toContain("'referral', v_referral_refund");
    expect(walletMigration).toContain("'error', 'INSUFFICIENT_CREDITS'");
    expect(walletMigration).toContain('v_cost CONSTANT INTEGER := 100');
    expect(walletMigration).toContain('p_amount <> 100');
    expect(walletMigration).toContain("'providerCalls', 1");
    expect(walletMigration).toContain("'guideTransform', 'cloudflare_images'");
    expect(walletMigration).not.toContain('daily_image_gen_used =');
  });
});
