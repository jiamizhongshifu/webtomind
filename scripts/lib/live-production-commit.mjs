export function assessLiveProductionCommit({ candidate, live, relation }) {
  if (!live || !candidate || relation === 'unknown') {
    return {
      ok: true,
      warn: 'Live production commit could not be verified; live-commit guard skipped.',
      errors: []
    };
  }

  if (relation === 'same') {
    return { ok: true, warn: '', errors: [] };
  }

  if (relation === 'live-before-candidate') {
    return {
      ok: true,
      warn: `Production ${live.slice(0, 12)} is behind candidate ${candidate.slice(0, 12)}; forward deploy confirmed.`,
      errors: []
    };
  }

  if (relation === 'candidate-before-live') {
    return {
      ok: false,
      warn: '',
      errors: [
        `Production is already at ${live.slice(0, 12)}, which is not an ancestor of candidate ${candidate.slice(0, 12)}. Deploying would silently revert live behavior that was shipped after this candidate; refusing.`
      ]
    };
  }

  return {
    ok: false,
    warn: '',
    errors: [
      `Production ${live.slice(0, 12)} and candidate ${candidate.slice(0, 12)} have diverged. Refusing to deploy over an unrelated production commit.`
    ]
  };
}
