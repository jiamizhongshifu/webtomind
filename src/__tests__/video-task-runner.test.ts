import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSupabaseAdminMock,
  buildArkVideoCreateHttpRequestMock,
  createMediaStorageAdapterMock,
  createMediaStorageAdaptersMock,
  buildClientMediaUrlsMock,
  putObjectMock,
  signReadUrlMock,
  deleteObjectsMock
} = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  buildArkVideoCreateHttpRequestMock: vi.fn(() => ({
    method: 'POST',
    path: '/contents/generations/tasks',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'doubao-seedance-2-0-260128' })
  })),
  createMediaStorageAdapterMock: vi.fn(),
  createMediaStorageAdaptersMock: vi.fn(),
  buildClientMediaUrlsMock: vi.fn(),
  putObjectMock: vi.fn(),
  signReadUrlMock: vi.fn(),
  deleteObjectsMock: vi.fn()
}));

vi.mock('../../api/utils/auth.js', () => ({
  getSupabaseAdmin: getSupabaseAdminMock
}));

vi.mock('../../src/shared/ark-video-api.js', () => ({
  buildArkVideoCreateHttpRequest: buildArkVideoCreateHttpRequestMock,
  getArkVideoApiBaseUrl: () => 'https://ark.test/api/v3',
  getArkVideoApiKey: () => 'ark-key',
  getArkVideoStatusPath: (taskId: string) =>
    `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
  normalizeArkVideoCreateResponse: (data: unknown) => data,
  normalizeArkVideoStatusResponse: (data: unknown) => data
}));

vi.mock('../../api/utils/media-storage/index', () => ({
  buildMediaMetadata: (input: {
    existing?: Record<string, unknown>;
    storageProvider: string;
    original: Record<string, unknown>;
  }) => ({
    ...(input.existing || {}),
    storageProvider: input.storageProvider,
    storageBucket: input.original.bucket,
    storagePath: input.original.key,
    media: {
      original: input.original
    }
  }),
  buildClientMediaUrls: buildClientMediaUrlsMock,
  createMediaStorageAdapter: createMediaStorageAdapterMock,
  createMediaStorageAdapters: createMediaStorageAdaptersMock
}));

import { runVideoGenerationTaskStep } from '../../api/video/task-runner';

type VideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface VideoTaskRow {
  id: string;
  user_id: string;
  status: VideoTaskStatus;
  provider: string;
  provider_task_id: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  refund_failed: boolean | null;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface VideoGenerationRow {
  id: string;
  user_id: string;
  task_id: string | null;
  video_url: string | null;
  poster_url: string | null;
  prompt: string;
  model_label: string;
  provider: string;
  provider_model: string;
  provider_task_id: string | null;
  aspect_ratio: string | null;
  duration: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  byte_size: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  [key: string]: unknown;
}

function makeTask(overrides: Partial<VideoTaskRow> = {}): VideoTaskRow {
  return {
    id: 'video-task-1',
    user_id: 'user-1',
    status: 'queued',
    provider: 'volcengine_ark',
    provider_task_id: null,
    request_payload: {
      prompt: 'cinematic product reveal',
      model: 'seedance-2-0',
      apiModel: 'doubao-seedance-2-0-260128',
      aspectRatio: '16:9',
      duration: 5,
      resolution: '720p',
      outputFormat: 'mp4',
      costEstimate: {
        modelLabel: 'Seedance 2.0'
      },
      prepaidCredit: {
        consumed: 300,
        creditType: 'mixed',
        creditBreakdown: {
          daily: 100,
          bonus: 200
        }
      }
    },
    result_payload: null,
    error_message: null,
    refund_failed: false,
    generation_id: null,
    locked_until: null,
    queue_message_count: 0,
    created_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
    ...overrides
  };
}

class SupabaseQuery {
  private filters: Array<{ field: string; value: unknown }> = [];
  private insertValue: Record<string, unknown> | null = null;
  private updateValue: Record<string, unknown> | null = null;

  constructor(
    private table: string,
    private db: {
      video_generation_tasks: VideoTaskRow[];
      video_generations: VideoGenerationRow[];
    }
  ) {}

  select() {
    return this;
  }

  insert(value: Record<string, unknown>) {
    this.insertValue = value;
    return this;
  }

  update(value: Record<string, unknown>) {
    this.updateValue = value;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    if (this.updateValue) {
      this.applyUpdate();
    }
    return this;
  }

  private rows() {
    return this.db[this.table as keyof typeof this.db] as Array<
      Record<string, unknown>
    >;
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => row[filter.field] === filter.value);
  }

  private applyUpdate() {
    this.rows()
      .filter((row) => this.matches(row))
      .forEach((row) => Object.assign(row, this.updateValue));
  }

  async single() {
    if (this.insertValue) {
      const row = {
        id: 'generation-1',
        created_at: '2026-06-15T00:01:00.000Z',
        ...this.insertValue
      } as VideoGenerationRow;
      this.db.video_generations.push(row);
      return { data: row, error: null };
    }

    const data = this.rows().find((row) => this.matches(row)) || null;
    return {
      data,
      error: data ? null : { message: 'not found' }
    };
  }
}

function createSupabaseMock(
  tasks: VideoTaskRow[],
  options: {
    claimError?: { message: string };
  } = {}
) {
  const db = {
    video_generation_tasks: tasks,
    video_generations: [] as VideoGenerationRow[]
  };
  return {
    db,
    from: vi.fn((table: string) => new SupabaseQuery(table, db)),
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'claim_video_generation_task') {
        if (options.claimError) {
          return { data: null, error: options.claimError };
        }

        const task = db.video_generation_tasks.find(
          (row) => row.id === args?.p_task_id
        );
        if (!task) {
          return { data: { claimed: false, reason: 'not_found' }, error: null };
        }

        const now = Date.now();
        const lockedUntil =
          typeof task.locked_until === 'string'
            ? new Date(task.locked_until).getTime()
            : 0;
        const phase = args?.p_expected_phase;
        const status = args?.p_expected_status;
        const phaseMatches =
          (phase === 'create' && !task.provider_task_id) ||
          (phase === 'poll' && Boolean(task.provider_task_id));
        const claimable =
          task.status === status &&
          (task.status === 'queued' || task.status === 'running') &&
          (!lockedUntil || lockedUntil <= now) &&
          phaseMatches;

        if (!claimable) {
          return {
            data: {
              claimed: false,
              reason: lockedUntil > now ? 'locked' : 'not_claimable',
              status: task.status,
              providerTaskId: task.provider_task_id,
              lockedUntil: task.locked_until
            },
            error: null
          };
        }

        task.status =
          phase === 'create' && task.status === 'queued'
            ? 'running'
            : task.status;
        task.locked_until = new Date(now + 120000).toISOString();
        task.last_attempt_at = new Date(now).toISOString();
        task.queue_message_count = Number(task.queue_message_count || 0) + 1;
        return {
          data: {
            claimed: true,
            taskId: task.id,
            status: task.status,
            phase,
            providerTaskId: task.provider_task_id,
            lockedUntil: task.locked_until,
            queueMessageCount: task.queue_message_count
          },
          error: null
        };
      }

      return { data: { success: true }, error: null };
    })
  };
}

function getRpcCalls(sb: ReturnType<typeof createSupabaseMock>, name: string) {
  return sb.rpc.mock.calls.filter((call) => call[0] === name);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('video task runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putObjectMock.mockResolvedValue({
      provider: 'supabase',
      bucket: 'user-generated-videos',
      key: 'user-1/video-task-1/video.mp4'
    });
    signReadUrlMock.mockResolvedValue('https://storage.test/video.mp4');
    deleteObjectsMock.mockResolvedValue(undefined);
    createMediaStorageAdapterMock.mockReturnValue({
      putObject: putObjectMock,
      signReadUrl: signReadUrlMock,
      deleteObjects: deleteObjectsMock
    });
    createMediaStorageAdaptersMock.mockReturnValue({
      supabase: {
        signReadUrl: signReadUrlMock
      },
      r2: null
    });
    buildClientMediaUrlsMock.mockResolvedValue({
      videoUrl: 'https://storage.test/video.mp4',
      videoUrlExpiresIn: 86400
    });
  });

  it('preserves frames and multimodal options when a queued task reaches Ark', async () => {
    const task = makeTask({
      request_payload: {
        ...makeTask().request_payload,
        model: 'seedance-2-5',
        apiModel: 'doubao-seedance-2-5-260628',
        outputFormat: 'mov',
        referenceImageUrls: ['https://example.com/image.png'],
        referenceVideoUrls: ['https://example.com/motion.mp4'],
        referenceAudioUrls: ['https://example.com/rhythm.mp3'],
        watermark: true,
        webSearch: false
      }
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ id: 'provider-task-1', status: 'pending' })
      )
    );

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });

    expect(buildArkVideoCreateHttpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'doubao-seedance-2-5-260628',
        outputFormat: 'mov',
        referenceImageUrls: ['https://example.com/image.png'],
        referenceVideoUrls: ['https://example.com/motion.mp4'],
        referenceAudioUrls: ['https://example.com/rhythm.mp3'],
        watermark: true,
        webSearch: false
      })
    );
    expect(result).toMatchObject({
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: 'provider-task-1'
    });
  });

  it('preserves strict first and last frames when a queued task reaches Ark', async () => {
    const task = makeTask({
      request_payload: {
        ...makeTask().request_payload,
        firstFrameUrl: 'https://example.com/first.png',
        lastFrameUrl: 'https://example.com/last.png',
        watermark: false,
        webSearch: false
      }
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ id: 'provider-task-1', status: 'pending' })
      )
    );

    await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });

    expect(buildArkVideoCreateHttpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        firstFrameUrl: 'https://example.com/first.png',
        lastFrameUrl: 'https://example.com/last.png'
      })
    );
  });

  it('does not submit provider create again for a duplicate create message after provider task exists', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 'provider-task-1',
        status: 'pending',
        raw: { status: 'pending' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(String(firstFetchCall?.[0] || '')).toContain(
      '/contents/generations/tasks/provider-task-1'
    );
    expect(result).toMatchObject({
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: 'provider-task-1',
      reenqueue: {
        taskId: task.id,
        phase: 'poll',
        delaySeconds: 5
      }
    });
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(
      getRpcCalls(sb, 'claim_video_generation_task')[0]?.[1]
    ).toMatchObject({
      p_expected_phase: 'poll',
      p_expected_status: 'running'
    });
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
  });

  it('refunds provider create failures once and leaves completed failed tasks idempotent', async () => {
    const task = makeTask();
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'provider rejected' }, 500))
    );

    const first = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });
    const second = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });

    expect(first).toMatchObject({
      taskId: task.id,
      status: 'failed',
      error: 'provider rejected',
      refundFailed: false
    });
    expect(second).toMatchObject({
      taskId: task.id,
      status: 'failed'
    });
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')[0]?.[1]).toEqual(
      expect.objectContaining({
        p_source: `video_task:${task.id}:refund`,
        p_metadata: expect.objectContaining({
          billingDomain: 'video_task',
          idempotency_key: `video_task:${task.id}:refund`,
          idempotencyKey: `video_task:${task.id}:refund`,
          taskId: task.id
        })
      })
    );
  });

  it('reenqueues pending provider polls without refunding', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'provider-task-1',
          status: 'processing',
          raw: { status: 'processing' }
        })
      )
    );

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'poll'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: 'provider-task-1',
      reenqueue: {
        phase: 'poll',
        delaySeconds: 5
      }
    });
    expect(task.status).toBe('running');
    expect(task.next_poll_after).toBeTruthy();
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
  });

  it('stores completed MOV output with the requested extension and finalizes the task', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1',
      request_payload: {
        ...makeTask().request_payload,
        model: 'seedance-2-5',
        apiModel: 'doubao-seedance-2-5-260628',
        outputFormat: 'mov'
      }
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/contents/generations/tasks/')) {
        return jsonResponse({
          id: 'provider-task-1',
          status: 'succeeded',
          videoUrl: 'https://cdn.test/video.mov',
          previewImageUrl: 'https://cdn.test/poster.jpg',
          raw: { status: 'succeeded' }
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'poll'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'succeeded',
      generationId: 'generation-1',
      providerTaskId: 'provider-task-1'
    });
    expect(putObjectMock).toHaveBeenCalledTimes(1);
    expect(putObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/\.mov$/),
        contentType: 'application/octet-stream'
      })
    );
    expect(sb.db.video_generations).toHaveLength(1);
    expect(task.status).toBe('succeeded');
    expect(task.generation_id).toBe('generation-1');
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
  });

  it('marks provider failed polls as failed with an idempotent refund', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'provider-task-1',
          status: 'failed',
          errorMessage: 'provider render failed',
          raw: { status: 'failed' }
        })
      )
    );

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'poll'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'failed',
      providerTaskId: 'provider-task-1',
      error: 'provider render failed',
      refundFailed: false
    });
    expect(task.status).toBe('failed');
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(1);
  });

  it('keeps provider poll transport failures running and schedules another poll without refunding', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'temporary outage' }, 503))
    );

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'poll'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: 'provider-task-1',
      error: 'Official video status failed with status 503',
      reenqueue: {
        taskId: task.id,
        phase: 'poll',
        delaySeconds: 8
      }
    });
    expect(task.status).toBe('running');
    expect(task.result_payload).toMatchObject({
      transientError: {
        phase: 'poll',
        message: 'Official video status failed with status 503'
      }
    });
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
  });

  it('does not call the provider or refund when the task lease is already held', async () => {
    const task = makeTask({
      status: 'queued',
      locked_until: new Date(Date.now() + 60000).toISOString()
    });
    const sb = createSupabaseMock([task]);
    getSupabaseAdminMock.mockReturnValue(sb);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'create'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'queued',
      phase: 'create',
      error: 'Video task claim skipped: locked',
      reenqueue: {
        taskId: task.id,
        phase: 'create',
        delaySeconds: 5
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
    expect(task.provider_task_id).toBeNull();
    expect(task.status).toBe('queued');
  });

  it('reenqueues conservatively when the claim RPC is missing or fails', async () => {
    const task = makeTask({
      status: 'running',
      provider_task_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task], {
      claimError: {
        message: 'function claim_video_generation_task does not exist'
      }
    });
    getSupabaseAdminMock.mockReturnValue(sb);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runVideoGenerationTaskStep({
      taskId: task.id,
      phase: 'poll'
    });

    expect(result).toMatchObject({
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: 'provider-task-1',
      error: 'function claim_video_generation_task does not exist',
      reenqueue: {
        taskId: task.id,
        phase: 'poll',
        delaySeconds: 5
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getRpcCalls(sb, 'claim_video_generation_task')).toHaveLength(1);
    expect(getRpcCalls(sb, 'refund_generation_credit')).toHaveLength(0);
    expect(getRpcCalls(sb, 'refund_image_generation_credit')).toHaveLength(0);
  });
});
