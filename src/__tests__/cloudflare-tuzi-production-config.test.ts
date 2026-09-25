import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = path.join(process.cwd(), 'workers/webtomind.wrangler.toml');

describe('Cloudflare Tuzi production routing contract', () => {
  it('keeps ordinary GPT Image 2 requests on the recoverable async primary', () => {
    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain('GPT_IMAGE_2_FORCE_TUZI_PRIMARY = "false"');
    expect(config).toContain(
      'GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = "true"'
    );
    expect(config).toContain('TUZI_ENABLE_OPENAI_COMPAT_FALLBACK = "true"');
    expect(config).toContain(
      'TUZI_IMAGE_API_BASE_URL = "https://gateway.ai.cloudflare.com/v1/<your-cloudflare-account-id>/webtomind-images/custom-tuzi-image"'
    );
    expect(config).toContain('OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE = "all"');
    expect(config).toContain('KRILL_IMAGE_MODEL = "gpt-image-2"');
    expect(config).toContain('KRILL_IMAGE_MODEL_2K = "gpt-image-2-2k"');
    expect(config).toContain('KRILL_IMAGE_MODEL_4K = "gpt-image-2-4k"');
    expect(config).toContain(
      'KRILL_IMAGE_API_BASE_URL = "https://api.cdn-krill-ai.com/v1"'
    );
    expect(config).toContain('KRILL_IMAGE_1K_ENABLED = "true"');
    expect(config).toContain('KRILL_IMAGE_2K_ENABLED = "false"');
    expect(config).toContain('KRILL_IMAGE_4K_ENABLED = "false"');
    expect(config).toContain('QUEUED_TUZI_FALLBACK_TIMEOUT_MS = "120000"');
  });
});
