import { describe, expect, it } from 'vitest';

import { isCreateWorkspaceOverrideHost } from '../create-workspace-flags';

describe('create workspace feature flag overrides', () => {
  it.each(['localhost', '127.0.0.1', '::1'])(
    'allows the isolated local harness host %s',
    (hostname) => {
      expect(isCreateWorkspaceOverrideHost(hostname)).toBe(true);
    }
  );

  it.each(['webtomind.ai', 'app.webtomind.ai', 'preview.example.com'])(
    'rejects browser-local rollout overrides on %s',
    (hostname) => {
      expect(isCreateWorkspaceOverrideHost(hostname)).toBe(false);
    }
  );
});
