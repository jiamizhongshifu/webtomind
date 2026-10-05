// Every deployment entry point calls these checks explicitly. pnpm does not
// enable pre/post script hooks by default, so safety must not depend on them.
export const DEPLOY_CHECKS = [
  ['scripts/check-tracked-secrets.mjs', '--strict-index'],
  ['scripts/check-cloudflare-deploy-source.mjs'],
  ['scripts/check-github-release-ci.mjs'],
  ['scripts/check-release-contracts.mjs'],
  ['scripts/business-guardrails.mjs'],
  ['scripts/check-live-production-commit.mjs'],
  ['scripts/image-generation-health-gate.mjs', '--days', '7'],
  ['scripts/check-release-contracts.mjs', '--build'],
  [
    'scripts/check-release-contracts.mjs',
    '--continuity',
    'https://webtomind.com'
  ]
];

export function deployAfterChecks(runCheck, deploy) {
  for (const args of DEPLOY_CHECKS) runCheck(args);
  return deploy();
}
