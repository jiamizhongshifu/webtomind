import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const shouldRunRealTaskE2E =
  process.env.E2E_IMAGE_TASK_RUN_REAL === 'true' &&
  (Boolean(process.env.E2E_IMAGE_TASK_AUTH_TOKEN) ||
    (Boolean(process.env.E2E_IMAGE_TASK_USER_EMAIL) &&
      Boolean(process.env.E2E_IMAGE_TASK_USER_PASSWORD) &&
      Boolean(process.env.SUPABASE_URL) &&
      Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      )));

const baseUrl = (
  process.env.E2E_IMAGE_TASK_BASE_URL || 'https://webtomind.com'
).replace(/\/+$/, '');
const configuredAuthToken = process.env.E2E_IMAGE_TASK_AUTH_TOKEN || '';
const seedQueueMode = process.env.E2E_IMAGE_TASK_SEED_QUEUE === 'true';

type E2EAuthContext = {
  token: string;
  userId?: string;
  supabase?: ReturnType<typeof createClient>;
};

async function findUserIdByEmail({
  supabase,
  email
}: {
  supabase: ReturnType<typeof createClient>;
  email: string;
}): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100
    });
    if (error) throw error;
    const user = data.users.find(
      (item) => item.email?.trim().toLowerCase() === normalizedEmail
    );
    if (user?.id) return user.id;
    if (data.users.length < 100) break;
  }
  return null;
}

async function resolveAuthContext(): Promise<E2EAuthContext> {
  if (configuredAuthToken) return { token: configuredAuthToken };

  const email = process.env.E2E_IMAGE_TASK_USER_EMAIL || '';
  const password = process.env.E2E_IMAGE_TASK_USER_PASSWORD || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!email || !password || !supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing E2E_IMAGE_TASK_AUTH_TOKEN or E2E_IMAGE_TASK_USER_EMAIL/PASSWORD with Supabase credentials.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
  const authClient = createClient(
    supabaseUrl,
    process.env.SUPABASE_ANON_KEY || supabaseKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    }
  );
  const signIn = async () =>
    authClient.auth.signInWithPassword({ email, password });

  const firstSignIn = await signIn();
  if (firstSignIn.data.session?.access_token) {
    return {
      token: firstSignIn.data.session.access_token,
      userId: firstSignIn.data.user?.id,
      supabase
    };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Creating or resetting the E2E image task user requires SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const userId = await findUserIdByEmail({ supabase, email });
  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { e2e: 'image-task-dual-client' }
    });
    if (error) throw error;
  }

  const secondSignIn = await signIn();
  if (secondSignIn.error || !secondSignIn.data.session?.access_token) {
    throw (
      secondSignIn.error || new Error('Unable to sign in E2E image task user.')
    );
  }
  return {
    token: secondSignIn.data.session.access_token,
    userId: secondSignIn.data.user?.id,
    supabase
  };
}

async function maybeGrantTestCredits(context: E2EAuthContext) {
  if (process.env.E2E_IMAGE_TASK_GRANT_CREDITS !== 'true') return;
  if (!context.supabase || !context.userId) {
    throw new Error(
      'E2E_IMAGE_TASK_GRANT_CREDITS requires E2E_IMAGE_TASK_USER_EMAIL/PASSWORD with Supabase credentials.'
    );
  }
  const amount = Math.max(
    1,
    Math.min(
      2000,
      Number(process.env.E2E_IMAGE_TASK_GRANT_AMOUNT || 800) || 800
    )
  );
  const { error } = await context.supabase.rpc('add_bonus_credits', {
    p_user_id: context.userId,
    p_amount: amount,
    p_source: 'e2e_image_task',
    p_metadata: {
      test: 'image-task-dual-client',
      grantedAt: new Date().toISOString()
    }
  });
  if (error) throw error;
}

function buildSeedTaskPayload(label: string) {
  return {
    prompt: `E2E seeded image task sync ${label}`,
    negativePrompt: 'low quality, watermark',
    model: process.env.E2E_IMAGE_TASK_MODEL || 'gpt-image-2',
    modelLabel: process.env.E2E_IMAGE_TASK_MODEL || 'GPT Image 2',
    provider: 'e2e',
    aspectRatio: '1:1',
    imageSize: 'auto',
    quality: 'low',
    qualityLabel: 'Low',
    outputFormat: 'png',
    assetIds: [],
    referenceImageIds: [],
    referenceMode: 'none',
    characterCardIds: [],
    characterReferenceGroups: [],
    promptMode: 'custom',
    imageCount: 1,
    promptAspectRatio: '1:1',
    promptImageSize: 'auto',
    prepaidCredit: null,
    creditWaiver: { reason: 'e2e_seeded_queue' }
  };
}

async function seedImageTask({
  context,
  label,
  createdAt,
  status = 'queued',
  errorMessage
}: {
  context: E2EAuthContext;
  label: string;
  createdAt: Date;
  status?: 'queued' | 'failed';
  errorMessage?: string;
}): Promise<string> {
  if (!context.supabase || !context.userId) {
    throw new Error(
      'E2E_IMAGE_TASK_SEED_QUEUE requires E2E_IMAGE_TASK_USER_EMAIL/PASSWORD with Supabase credentials.'
    );
  }
  const { data, error } = await context.supabase
    .from('image_generation_tasks')
    .insert({
      user_id: context.userId,
      status,
      request_payload: buildSeedTaskPayload(label),
      ...(status === 'failed'
        ? {
            error_message: errorMessage || 'E2E persisted failed task',
            result_payload: {
              success: false,
              errorDetails: {
                code: 'E2E_FAILED_TASK',
                category: 'provider_timeout',
                retryable: true
              }
            },
            completed_at: createdAt.toISOString()
          }
        : {}),
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString()
    })
    .select('id')
    .single();
  if (error || !data?.id) {
    throw error || new Error('Unable to seed image task.');
  }
  return data.id as string;
}

async function cleanupSeededTasks(context: E2EAuthContext, taskIds: string[]) {
  if (!context.supabase || !taskIds.length) return;
  await context.supabase
    .from('image_generation_tasks')
    .delete()
    .in('id', taskIds);
}

async function cleanupExistingE2ESeededTasks(context: E2EAuthContext) {
  if (!context.supabase || !context.userId) return;
  await context.supabase
    .from('image_generation_tasks')
    .delete()
    .eq('user_id', context.userId)
    .contains('request_payload', { provider: 'e2e' });
}

type TaskSnapshot = {
  success?: boolean;
  activeCount?: number;
  runningCount?: number;
  queuedCount?: number;
  failedCount?: number;
  maxConcurrency?: number;
  tasks?: Array<{
    taskId: string;
    status: 'queued' | 'running' | 'failed';
    queuePosition?: number;
  }>;
};

async function apiRequest<T>(
  page: Page,
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init, token }) => {
      const response = await fetch(path, {
        method: init.method || 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body)
      });
      return {
        status: response.status,
        body: await response.json().catch(() => ({}))
      };
    },
    { path: `${baseUrl}${path}`, init, token }
  );
}

function comparableSnapshot(snapshot: TaskSnapshot) {
  return {
    activeCount: snapshot.activeCount,
    runningCount: snapshot.runningCount,
    queuedCount: snapshot.queuedCount,
    failedCount: snapshot.failedCount,
    maxConcurrency: snapshot.maxConcurrency,
    tasks: (snapshot.tasks || [])
      .map((task) => ({
        taskId: task.taskId,
        status: task.status,
        queuePosition: task.queuePosition
      }))
      .sort((a, b) => a.taskId.localeCompare(b.taskId))
  };
}

async function getSnapshot(page: Page, token: string): Promise<TaskSnapshot> {
  const response = await apiRequest<TaskSnapshot>(
    page,
    '/api/image/task?mode=active&limit=20',
    token
  );
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  return response.body;
}

async function expectSnapshotsToMatch(
  desktop: Page,
  mobile: Page,
  token: string
) {
  await expect
    .poll(
      async () => {
        const [desktopSnapshot, mobileSnapshot] = await Promise.all([
          getSnapshot(desktop, token),
          getSnapshot(mobile, token)
        ]);
        return (
          JSON.stringify(comparableSnapshot(desktopSnapshot)) ===
          JSON.stringify(comparableSnapshot(mobileSnapshot))
        );
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] }
    )
    .toBe(true);
}

test.describe('image task dual-client sync', () => {
  test.skip(
    !shouldRunRealTaskE2E,
    'Set E2E_IMAGE_TASK_RUN_REAL=true plus either E2E_IMAGE_TASK_AUTH_TOKEN or E2E_IMAGE_TASK_USER_EMAIL/PASSWORD with Supabase credentials to run this live task sync test.'
  );

  test('desktop and mobile observe the same queue, wait, and cancel state', async ({
    browser
  }) => {
    test.setTimeout(120_000);
    const authContext = await resolveAuthContext();
    const authToken = authContext.token;
    await cleanupExistingE2ESeededTasks(authContext);
    if (!seedQueueMode) {
      await maybeGrantTestCredits(authContext);
    }
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const desktop = await desktopContext.newPage();
    const mobile = await mobileContext.newPage();
    const createdTaskIds: string[] = [];
    const seededTaskIds: string[] = [];

    try {
      await Promise.all([
        desktop.goto(`${baseUrl}/create`, { waitUntil: 'domcontentloaded' }),
        mobile.goto(`${baseUrl}/create`, { waitUntil: 'domcontentloaded' })
      ]);

      if (seedQueueMode) {
        const now = Date.now();
        const firstTaskId = await seedImageTask({
          context: authContext,
          label: 'first',
          createdAt: new Date(now - 2000)
        });
        const secondTaskId = await seedImageTask({
          context: authContext,
          label: 'second',
          createdAt: new Date(now - 1000)
        });
        seededTaskIds.push(firstTaskId, secondTaskId);

        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const seededSnapshot = await getSnapshot(desktop, authToken);
        const firstSeeded = seededSnapshot.tasks?.find(
          (task) => task.taskId === firstTaskId
        );
        const secondSeeded = seededSnapshot.tasks?.find(
          (task) => task.taskId === secondTaskId
        );
        expect(firstSeeded?.status).toBe('queued');
        expect(secondSeeded?.status).toBe('queued');
        expect(firstSeeded?.queuePosition || 0).toBeLessThan(
          secondSeeded?.queuePosition || Number.MAX_SAFE_INTEGER
        );

        const cancel = await apiRequest(mobile, '/api/image/task', authToken, {
          method: 'POST',
          body: { id: secondTaskId, action: 'cancel' }
        });
        expect(cancel.status).toBe(200);
        seededTaskIds.splice(seededTaskIds.indexOf(secondTaskId), 1);
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const afterCancel = await getSnapshot(desktop, authToken);
        expect(
          afterCancel.tasks?.some((task) => task.taskId === secondTaskId)
        ).toBe(false);

        const failedTaskId = await seedImageTask({
          context: authContext,
          label: 'failed',
          createdAt: new Date(now - 500),
          status: 'failed',
          errorMessage: 'E2E persisted failed task'
        });
        seededTaskIds.push(failedTaskId);
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const failedSnapshot = await getSnapshot(desktop, authToken);
        const failedSeeded = failedSnapshot.tasks?.find(
          (task) => task.taskId === failedTaskId
        );
        expect(failedSeeded?.status).toBe('failed');

        const deleteFailed = await apiRequest(
          mobile,
          '/api/image/task',
          authToken,
          {
            method: 'POST',
            body: { id: failedTaskId, action: 'delete_failed' }
          }
        );
        expect(deleteFailed.status).toBe(200);
        seededTaskIds.splice(seededTaskIds.indexOf(failedTaskId), 1);
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const afterDeleteFailed = await getSnapshot(desktop, authToken);
        expect(
          afterDeleteFailed.tasks?.some((task) => task.taskId === failedTaskId)
        ).toBe(false);

        const overflowFailedTaskIds = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            seedImageTask({
              context: authContext,
              label: `failed-overflow-${index + 1}`,
              createdAt: new Date(now + index + 1),
              status: 'failed',
              errorMessage: `E2E persisted failed overflow task ${index + 1}`
            })
          )
        );
        seededTaskIds.push(...overflowFailedTaskIds);
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const overflowSnapshot = await getSnapshot(desktop, authToken);
        const visibleFailedTaskIds = (overflowSnapshot.tasks || [])
          .filter((task) => task.status === 'failed')
          .map((task) => task.taskId);
        expect(visibleFailedTaskIds).toHaveLength(5);
        expect(overflowSnapshot.failedCount).toBe(5);
        expect(
          overflowSnapshot.tasks?.some((task) => task.taskId === firstTaskId)
        ).toBe(true);
        expect(visibleFailedTaskIds).toEqual(
          overflowFailedTaskIds.slice(-5).sort((a, b) => {
            const left = overflowFailedTaskIds.indexOf(a);
            const right = overflowFailedTaskIds.indexOf(b);
            return left - right;
          })
        );

        const deleteOverflowFailed = await apiRequest(
          mobile,
          '/api/image/task',
          authToken,
          {
            method: 'POST',
            body: {
              id: overflowFailedTaskIds[overflowFailedTaskIds.length - 1],
              action: 'delete_failed'
            }
          }
        );
        expect(deleteOverflowFailed.status).toBe(200);
        seededTaskIds.splice(
          seededTaskIds.indexOf(
            overflowFailedTaskIds[overflowFailedTaskIds.length - 1]
          ),
          1
        );
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const afterDeleteOverflowFailed = await getSnapshot(desktop, authToken);
        expect(
          afterDeleteOverflowFailed.tasks?.some(
            (task) =>
              task.taskId ===
              overflowFailedTaskIds[overflowFailedTaskIds.length - 1]
          )
        ).toBe(false);
        expect(
          (afterDeleteOverflowFailed.tasks || []).filter((task) =>
            overflowFailedTaskIds.includes(task.taskId)
          )
        ).toHaveLength(0);
        return;
      }

      const requestBody = {
        prompt:
          process.env.E2E_IMAGE_TASK_PROMPT ||
          'E2E image task queue sync smoke test. Minimal neutral product icon.',
        negativePrompt: 'low quality, watermark',
        model: process.env.E2E_IMAGE_TASK_MODEL || 'gpt-image-2',
        aspectRatio: '1:1',
        imageSize: 'auto',
        quality: 'low',
        outputFormat: 'png',
        async: true
      };

      const first = await apiRequest<{ queued?: boolean; taskId?: string }>(
        desktop,
        '/api/image/generate',
        authToken,
        { method: 'POST', body: requestBody }
      );
      expect(first.status).toBe(202);
      expect(first.body.queued).toBe(true);
      expect(first.body.taskId).toBeTruthy();
      createdTaskIds.push(first.body.taskId as string);

      await expectSnapshotsToMatch(desktop, mobile, authToken);

      const beforeSecond = await getSnapshot(desktop, authToken);
      const firstStatusBeforeSecond = beforeSecond.tasks?.find(
        (task) => task.taskId === first.body.taskId
      )?.status;

      const second = await apiRequest<{ queued?: boolean; taskId?: string }>(
        mobile,
        '/api/image/generate',
        authToken,
        { method: 'POST', body: requestBody }
      );
      expect(second.status).toBe(202);
      expect(second.body.queued).toBe(true);
      expect(second.body.taskId).toBeTruthy();
      createdTaskIds.push(second.body.taskId as string);

      await expectSnapshotsToMatch(desktop, mobile, authToken);

      const afterSecond = await getSnapshot(desktop, authToken);
      const firstAfterSecond = afterSecond.tasks?.find(
        (task) => task.taskId === first.body.taskId
      );
      const secondAfterSecond = afterSecond.tasks?.find(
        (task) => task.taskId === second.body.taskId
      );
      expect(firstAfterSecond).toBeTruthy();
      expect(secondAfterSecond).toBeTruthy();

      if (firstStatusBeforeSecond === 'running') {
        expect(firstAfterSecond?.status).not.toBe('queued');
      } else if (
        firstAfterSecond?.status === 'queued' &&
        secondAfterSecond?.status === 'queued'
      ) {
        expect(firstAfterSecond.queuePosition || 0).toBeLessThan(
          secondAfterSecond.queuePosition || Number.MAX_SAFE_INTEGER
        );
      }

      if (secondAfterSecond?.status === 'queued') {
        const cancel = await apiRequest(mobile, '/api/image/task', authToken, {
          method: 'POST',
          body: { id: second.body.taskId, action: 'cancel' }
        });
        expect(cancel.status).toBe(200);
        createdTaskIds.pop();
        await expectSnapshotsToMatch(desktop, mobile, authToken);
        const afterCancel = await getSnapshot(desktop, authToken);
        expect(
          afterCancel.tasks?.some((task) => task.taskId === second.body.taskId)
        ).toBe(false);
      }

      await expect
        .poll(
          async () => {
            const snapshot = await getSnapshot(mobile, authToken);
            return (
              snapshot.tasks?.find((task) => task.taskId === first.body.taskId)
                ?.status || 'missing'
            );
          },
          { timeout: 90_000, intervals: [3000, 5000, 10000] }
        )
        .toMatch(/queued|running|failed/);
    } finally {
      for (const taskId of createdTaskIds) {
        await apiRequest(desktop, '/api/image/task', authToken, {
          method: 'POST',
          body: { id: taskId, action: 'cancel' }
        }).catch(() => undefined);
      }
      await cleanupSeededTasks(authContext, seededTaskIds);
      await desktopContext.close();
      await mobileContext.close();
    }
  });
});
