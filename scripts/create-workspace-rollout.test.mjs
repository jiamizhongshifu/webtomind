import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCreateWorkspaceProductionRollout,
  REQUIRED_CREATE_WORKSPACE_FLAGS
} from './lib/create-workspace-rollout.mjs';

test('accepts the complete production workspace rollout', () => {
  const configured = assertCreateWorkspaceProductionRollout(
    REQUIRED_CREATE_WORKSPACE_FLAGS.join(',')
  );

  assert.deepEqual(
    REQUIRED_CREATE_WORKSPACE_FLAGS.filter((flag) => configured.has(flag)),
    REQUIRED_CREATE_WORKSPACE_FLAGS
  );
});

test('fails closed when a production workspace flag is missing', () => {
  assert.throws(
    () =>
      assertCreateWorkspaceProductionRollout(
        REQUIRED_CREATE_WORKSPACE_FLAGS.filter(
          (flag) => flag !== 'moodboards_v1'
        ).join(',')
      ),
    /Missing VITE_CREATE_WORKSPACE_FLAGS: moodboards_v1/
  );
});

test('fails closed when the production workspace flag value is absent', () => {
  assert.throws(
    () => assertCreateWorkspaceProductionRollout(''),
    /Production create workspace rollout is incomplete/
  );
});
