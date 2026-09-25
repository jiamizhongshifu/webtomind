import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public prompt asset library capacity contract', () => {
  it('keeps the client and both public API runtimes above the current library size', () => {
    const client = readFileSync(
      resolve(process.cwd(), 'src/services/marketing-api.ts'),
      'utf8'
    );
    const edgeApi = readFileSync(
      resolve(process.cwd(), 'api/content/prompt-assets.ts'),
      'utf8'
    );
    const serverApi = readFileSync(
      resolve(process.cwd(), 'server/src/routes/content.ts'),
      'utf8'
    );

    expect(client).toMatch(/getPublicImagePromptAssets\(\s*limit = 1000/);
    expect(edgeApi).toMatch(/searchParams\.get\('limit'\) \|\| '1000'/);
    expect(serverApi).toMatch(/req\.query\('limit'\) \|\| '1000'/);
  });

  it('keeps edge and server catalog caches short enough for asset operations', () => {
    const edgeApi = readFileSync(
      resolve(process.cwd(), 'api/content/prompt-assets.ts'),
      'utf8'
    );
    const serverApi = readFileSync(
      resolve(process.cwd(), 'server/src/routes/content.ts'),
      'utf8'
    );
    const cacheContract = /public, max-age=60, stale-while-revalidate=300/;

    expect(edgeApi).toMatch(cacheContract);
    expect(serverApi).toMatch(cacheContract);
  });
});
