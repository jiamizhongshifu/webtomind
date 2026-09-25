import {
  publishAdminPromptCaseDraft,
  type PromptCase,
  type PromptCaseDraft
} from './agent-api';

export type AdminPromptCaseDraftBulkPublishItem = Pick<
  PromptCaseDraft,
  'id' | 'title'
>;

export type AdminPromptCaseDraftBulkPublishResult = {
  published: Array<{
    draftId: string;
    title: string;
    deletedDraftId: string;
    case?: PromptCase;
  }>;
  failures: Array<{
    draftId: string;
    title: string;
    error: string;
  }>;
};

export async function publishAllAdminPromptCaseDrafts(
  drafts: AdminPromptCaseDraftBulkPublishItem[],
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<AdminPromptCaseDraftBulkPublishResult> {
  const uniqueDrafts = Array.from(
    new Map(drafts.map((draft) => [draft.id, draft])).values()
  );
  const concurrency = Math.max(
    1,
    Math.min(5, Math.floor(options.concurrency ?? 3))
  );
  const published: AdminPromptCaseDraftBulkPublishResult['published'] = [];
  const failures: AdminPromptCaseDraftBulkPublishResult['failures'] = [];
  let completed = 0;

  for (let index = 0; index < uniqueDrafts.length; index += concurrency) {
    const batch = uniqueDrafts.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (draft) => {
        try {
          const result = await publishAdminPromptCaseDraft(draft.id);
          return {
            ok: true as const,
            draft,
            result
          };
        } catch (error) {
          return {
            ok: false as const,
            draft,
            error: error instanceof Error ? error.message : '草稿发布失败。'
          };
        } finally {
          completed += 1;
          options.onProgress?.(completed, uniqueDrafts.length);
        }
      })
    );

    results.forEach((item) => {
      if (item.ok) {
        published.push({
          draftId: item.draft.id,
          title: item.draft.title,
          deletedDraftId: item.result.deletedDraftId,
          case: item.result.case
        });
      } else {
        failures.push({
          draftId: item.draft.id,
          title: item.draft.title,
          error: item.error
        });
      }
    });
  }

  return { published, failures };
}
