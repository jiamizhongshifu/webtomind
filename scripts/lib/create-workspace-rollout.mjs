export const REQUIRED_CREATE_WORKSPACE_FLAGS = [
  'create_shell_v2',
  'image_studio_v2',
  'moodboards_v1',
  'pricing_workspace_v2',
  'visual_search_v1',
  'activation_journey_v1'
];

export function assertCreateWorkspaceProductionRollout(value) {
  const configured = new Set(
    String(value || '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean)
  );
  const missing = REQUIRED_CREATE_WORKSPACE_FLAGS.filter(
    (flag) => !configured.has(flag)
  );

  if (missing.length > 0) {
    throw new Error(
      `Production create workspace rollout is incomplete. Missing VITE_CREATE_WORKSPACE_FLAGS: ${missing.join(', ')}.`
    );
  }

  return configured;
}
