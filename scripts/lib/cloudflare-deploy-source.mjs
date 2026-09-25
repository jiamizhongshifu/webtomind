export function assessProductionDeploySource(snapshot) {
  const errors = [];
  const branch = snapshot.branch || '';

  if (snapshot.status.length > 0) {
    errors.push(
      'the working tree is dirty. Commit or remove every tracked and untracked change before deploying.'
    );
  }

  if (branch && branch !== 'main') {
    errors.push(
      `branch ${branch} cannot deploy production. Production releases must use main or a detached HEAD at the exact origin/main commit.`
    );
  }

  if (snapshot.commit !== snapshot.mainCommit) {
    errors.push(
      `HEAD ${snapshot.commit.slice(0, 12)} does not exactly match origin/main ${snapshot.mainCommit.slice(0, 12)}. Feature-branch descendants cannot deploy production before merge.`
    );
  }

  if (branch === 'main' && snapshot.upstreamName !== 'origin/main') {
    errors.push(
      `main must track origin/main, got ${snapshot.upstreamName || 'no upstream'}.`
    );
  }

  if (
    branch === 'main' &&
    snapshot.commit !== snapshot.upstreamCommit
  ) {
    errors.push(
      `local HEAD ${snapshot.commit.slice(0, 12)} does not match upstream ${snapshot.upstreamCommit.slice(0, 12)}. Push the exact commit before deploying.`
    );
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
