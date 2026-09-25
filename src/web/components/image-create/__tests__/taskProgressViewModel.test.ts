import { describe, expect, it } from 'vitest';
import type { VisualImageTaskListItem } from '@/services/agent-api';
import { getImageTaskProgressViewModel } from '../taskProgressViewModel';

const translate = (key: string, options?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'progress.taskQueued': '等待生成图片',
    'progress.taskFailed': '生成失败',
    'progress.taskMainGen': '正在生成图片',
    'progress.taskSucceeded': '图片已返回',
    'progress.taskPartialSucceeded': '部分图片已返回',
    'progress.taskCancelled': '已停止生成',
    'progress.taskDismissed': '任务已关闭',
    'progress.detailSubmitted': '已提交任务',
    'progress.detailDone': '已完成',
    'progress.detailDismissed': '已从任务列表关闭',
    'progress.detailPartialSucceeded': `已返回 ${String(options?.done)}/${String(options?.total)}，可继续生成剩余 ${String(options?.missing)} 张`,
    'progress.detailFallbackAfterFailure':
      '主通道响应超时，已切换备用通道继续生成',
    'progress.detailRescueSucceeded': '备用通道已返回图片，正在补齐剩余图片',
    'progress.detailWaitingModel': `已等待 ${String(options?.seconds)} 秒，模型正在接收任务`,
    'progress.detailGenerating': `已等待 ${String(options?.seconds)} 秒，模型正在生成图片`,
    'progress.detailFinalizing': `已等待 ${String(options?.seconds)} 秒，正在收尾`,
    'progress.queuePosition': `排队第 ${String(options?.n)} 位`,
    'progress.cancelledQueued': '已取消排队任务',
    'progress.cancelledRunning': '已停止运行任务',
    'errors.generateFailed': '生成图片失败',
    'errors.providerUnavailable':
      '当前模型通道繁忙或响应较慢，本次任务已自动退款。请稍后重试。'
  };
  return map[key] || key;
};

function makeTask(
  task: Partial<VisualImageTaskListItem>
): VisualImageTaskListItem {
  return {
    taskId: 'task-1',
    status: 'queued',
    request: {} as VisualImageTaskListItem['request'],
    createdAt: '2026-06-06T12:00:00.000Z',
    ...task
  };
}

describe('getImageTaskProgressViewModel', () => {
  it('keeps queued tasks visibly queued with server queue position', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({ status: 'queued', queuePosition: 2 }),
      translate
    });

    expect(vm).toEqual({
      label: '等待生成图片',
      status: 'queued',
      detail: '排队第 2 位'
    });
  });

  it('does not reuse stale running detail for queued tasks', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({ status: 'queued', queuePosition: 1 }),
      translate,
      fallbackDetail: '已等待 32 秒，模型正在接收任务'
    });

    expect(vm).toEqual({
      label: '等待生成图片',
      status: 'queued',
      detail: '排队第 1 位'
    });
  });

  it('keeps running tasks in the running state without changing queue state', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'running',
        startedAt: '2026-06-06T12:00:00.000Z'
      }),
      translate,
      now: new Date('2026-06-06T12:01:10.000Z').getTime()
    });

    expect(vm.status).toBe('running');
    expect(vm.label).toBe('正在生成图片');
    expect(vm.detail).toBe('已等待 70 秒，模型正在生成图片');
  });

  it('shows failed tasks with their persisted error text', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({ status: 'failed', error: 'provider timeout' }),
      translate
    });

    expect(vm).toEqual({
      label: '生成失败',
      status: 'failed',
      detail: 'provider timeout'
    });
  });

  it('maps unavailable provider failures to the busy-channel message', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'failed',
        error: 'No available channel for model midjourney-v7',
        errorCategory: 'provider_unavailable'
      }),
      translate
    });

    expect(vm).toEqual({
      label: '生成失败',
      status: 'failed',
      detail: '当前模型通道繁忙或响应较慢，本次任务已自动退款。请稍后重试。'
    });
  });

  it('maps partial succeeded tasks to the partial success state', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'succeeded',
        requestedImageCount: 2,
        actualImageCount: 1,
        request: { imageCount: 2 } as VisualImageTaskListItem['request']
      }),
      translate
    });

    expect(vm).toEqual({
      label: '部分图片已返回',
      status: 'succeeded',
      detail: '已返回 1/2，可继续生成剩余 1 张'
    });
  });

  it('keeps fallback stages user-facing as normal generation progress', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'running',
        startedAt: '2026-06-06T12:00:00.000Z',
        currentStage: {
          phase: 'fallback',
          providerLabel: 'OpenAI-compatible',
          status: 'failed',
          failureReason: '502'
        }
      }),
      translate,
      now: new Date('2026-06-06T12:01:10.000Z').getTime()
    });

    expect(vm).toEqual({
      label: '正在生成图片',
      status: 'running',
      detail: '已等待 70 秒，模型正在生成图片'
    });
  });

  it('keeps rescue stages user-facing as normal generation progress', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'running',
        startedAt: '2026-06-06T12:00:00.000Z',
        currentStage: {
          phase: 'rescue',
          providerLabel: 'tuzi/official_discount',
          status: 'succeeded'
        }
      }),
      translate,
      now: new Date('2026-06-06T12:03:10.000Z').getTime()
    });

    expect(vm).toEqual({
      label: '正在生成图片',
      status: 'running',
      detail: '已等待 190 秒，正在收尾'
    });
  });

  it('maps cancelled queued tasks to the stopped state', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({
        status: 'cancelled',
        cancelledTaskStatus: 'queued'
      }),
      translate
    });

    expect(vm).toEqual({
      label: '已停止生成',
      status: 'cancelled',
      detail: '已取消排队任务'
    });
  });

  it('allows the rail to model user-dismissed terminal tasks', () => {
    const vm = getImageTaskProgressViewModel({
      task: makeTask({ status: 'succeeded' }),
      translate,
      dismissed: true
    });

    expect(vm).toEqual({
      label: '任务已关闭',
      status: 'dismissed',
      detail: '已从任务列表关闭'
    });
  });
});
