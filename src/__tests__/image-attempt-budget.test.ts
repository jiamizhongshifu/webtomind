import { describe, expect, it } from 'vitest';
import { getTuziAttemptTimeoutMs } from '../../api/image/generate/tuzi-routing';

describe('Tuzi absolute attempt budget', () => {
  const options = {
    mode: 'queued' as const,
    tuziVipTimeoutMs: 260000,
    pipelineDeadlineMs: 240000,
    generationDeadlineAt: 240000
  };
  it('leaves time for another route and storage on a single-image request', () => {
    expect(getTuziAttemptTimeoutMs(options, 3, 1, 0)).toBe(120000);
    expect(getTuziAttemptTimeoutMs(options, 3, 1, 125000)).toBe(70000);
    expect(getTuziAttemptTimeoutMs(options, 3, 1, 190001)).toBe(0);
  });
  it('does not shorten the multi-image primary budget but caps subsequent attempts', () => {
    expect(getTuziAttemptTimeoutMs(options, 3, 4, 0)).toBe(195000);
    expect(getTuziAttemptTimeoutMs(options, 3, 4, 150000)).toBe(45000);
  });
  it('never starts an attempt after the task deadline', () => {
    expect(getTuziAttemptTimeoutMs(options, 1, 1, 241000)).toBe(0);
  });
});
