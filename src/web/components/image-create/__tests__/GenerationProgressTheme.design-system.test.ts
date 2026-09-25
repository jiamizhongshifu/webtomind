import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const mobileStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create-mobile.css'),
  'utf8'
);
const wranglerConfig = readFileSync(
  join(process.cwd(), 'workers/webtomind.wrangler.toml'),
  'utf8'
);

describe('generation progress production contracts', () => {
  it('keeps task surfaces on semantic dark-theme tokens', () => {
    expect(styles).toMatch(
      /\.creator-generation-feed \.creator-progress-task-beam,[\s\S]*?background:\s*var\(--product-task-bg, #141414\);/
    );
    expect(styles).toMatch(
      /\.creator-progress-task-beam\s*>\s*\.creator-progress-task\s*\{[\s\S]*?background:\s*var\(--product-task-panel, #1c1b19\);/
    );
    expect(styles).not.toMatch(
      /\.creator-progress-task-beam[\s\S]{0,240}background:\s*#666666;/
    );
  });

  it('keeps ordinary GPT Image 2 requests on the recoverable async primary', () => {
    expect(wranglerConfig).toContain(
      'GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY = "true"'
    );
    expect(wranglerConfig).toContain(
      'GPT_IMAGE_2_FORCE_TUZI_PRIMARY = "false"'
    );
    expect(wranglerConfig).toContain(
      'TUZI_IMAGE_API_BASE_URL = "https://gateway.ai.cloudflare.com/v1/<your-cloudflare-account-id>/webtomind-images/custom-tuzi-image"'
    );
  });

  it('keeps the unified history actions available on touch layouts', () => {
    expect(mobileStyles).toMatch(
      /\.creator-generation-card-actions\s*\{[\s\S]*?display:\s*grid;/
    );
    expect(mobileStyles).not.toMatch(
      /\.creator-generation-media-actions,\s*\.creator-generation-card-actions\s*\{[\s\S]*?display:\s*none;/
    );
  });
});
