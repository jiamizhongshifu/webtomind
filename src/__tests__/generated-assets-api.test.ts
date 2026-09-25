import { describe, expect, it } from 'vitest';
import { createAssetGenerateHandler } from '../../api/assets/generate';
import { createAssetHistoryHandler } from '../../api/assets/history';
import { createAssetDownloadHandler } from '../../api/assets/[id]/download';
import { GENERATED_ASSET_STORAGE_BUCKET } from '../shared/generated-assets';

function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*'
  };
}

describe('generated file assets API scaffold', () => {
  it('keeps generation behind an explicit 501 scaffold', async () => {
    const handler = createAssetGenerateHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => 'user-1'
    });

    const response = await handler(
      new Request('https://webtomind.test/api/assets/generate', {
        method: 'POST',
        body: JSON.stringify({
          appSlug: 'ppt-deck-lab',
          assetType: 'presentation',
          prompt: 'Quarterly review',
          outputFormat: 'pptx'
        })
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(501);
    expect(body).toMatchObject({
      success: false,
      error: 'FILE_ASSET_GENERATION_NOT_READY',
      appSlug: 'ppt-deck-lab',
      supportedFormats: ['pptx'],
      storageBucket: GENERATED_ASSET_STORAGE_BUCKET
    });
  });

  it('requires auth before file generation scaffold responses', async () => {
    const handler = createAssetGenerateHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => null
    });

    const response = await handler(
      new Request('https://webtomind.test/api/assets/generate', {
        method: 'POST',
        body: '{}'
      })
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({ error: 'Unauthorized' });
  });

  it('maps generated_assets rows for private file history', async () => {
    const queries: Array<{
      table: string;
      filters: Array<{ column: string; value: unknown }>;
    }> = [];

    function createBuilder(table: string) {
      const query = {
        table,
        filters: [] as Array<{ column: string; value: unknown }>,
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          query.filters.push({ column, value });
          return query;
        },
        order() {
          return query;
        },
        limit() {
          queries.push(query);
          return query;
        },
        lt(column: string, value: unknown) {
          query.filters.push({ column, value });
          return query;
        },
        then(resolve: (value: unknown) => void) {
          resolve({
            data: [
              {
                id: 'asset-1',
                task_id: 'task-1',
                app_slug: 'ppt-deck-lab',
                asset_type: 'presentation',
                title: 'Quarterly review',
                prompt: 'Quarterly review prompt',
                output_format: 'pptx',
                mime_type:
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                storage_bucket: GENERATED_ASSET_STORAGE_BUCKET,
                storage_path: 'user-1/202606/decks/quarterly-review.pptx',
                download_filename: 'quarterly-review.pptx',
                byte_size: 12345,
                status: 'ready',
                metadata: { slideCount: 8 },
                created_at: '2026-06-17T00:00:00.000Z'
              }
            ],
            error: null
          });
        }
      };
      return query;
    }

    const handler = createAssetHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => 'user-1',
      getSupabaseAdmin: () =>
        ({
          from: createBuilder
        }) as never
    });

    const response = await handler(
      new Request('https://webtomind.test/api/assets/history?limit=1')
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(queries[0]).toMatchObject({
      table: 'generated_assets',
      filters: [{ column: 'user_id', value: 'user-1' }]
    });
    expect(body.items).toMatchObject([
      {
        id: 'asset-1',
        taskId: 'task-1',
        appSlug: 'ppt-deck-lab',
        assetType: 'presentation',
        outputFormat: 'pptx',
        storageBucket: GENERATED_ASSET_STORAGE_BUCKET,
        storagePath: 'user-1/202606/decks/quarterly-review.pptx'
      }
    ]);
  });

  it('keeps private downloads behind an explicit 501 scaffold', async () => {
    const handler = createAssetDownloadHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => 'user-1'
    });

    const response = await handler(
      new Request('https://webtomind.test/api/assets/asset-1/download')
    );
    const body = await readJson(response);

    expect(response.status).toBe(501);
    expect(body).toMatchObject({
      success: false,
      error: 'FILE_ASSET_DOWNLOAD_NOT_READY',
      assetId: 'asset-1',
      storageBucket: GENERATED_ASSET_STORAGE_BUCKET
    });
  });
});
