export function assessReleaseCiRuns(commit, runs) {
  const matching = runs.filter((run) => run.headSha === commit);
  const successful = matching.find(
    (run) => run.status === 'completed' && run.conclusion === 'success'
  );
  if (successful) {
    return { ok: true, run: successful, matching };
  }
  if (matching.length === 0) {
    return {
      ok: false,
      reason: `no CI run exists for ${commit.slice(0, 12)}`,
      matching
    };
  }
  const summary = matching
    .map((run) => `${run.status}/${run.conclusion || 'pending'} (${run.url || run.databaseId})`)
    .join(', ');
  return {
    ok: false,
    reason: `CI has not passed for ${commit.slice(0, 12)}: ${summary}`,
    matching
  };
}
