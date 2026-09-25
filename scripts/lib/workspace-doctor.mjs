export const WORKSPACE_MODES = new Set(['development', 'sync', 'deploy']);

function result(name, ok, detail, remediation = '') {
  return { name, ok, detail, remediation };
}

function parseVersion(value) {
  const match = String(value)
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function satisfiesNodeEngine(version, engine) {
  const current = parseVersion(version);
  if (!current) return false;

  return String(engine)
    .split('||')
    .map((part) => part.trim())
    .some((part) => {
      const minimumMatch = part.match(/^>=(\d+\.\d+\.\d+)$/);
      if (minimumMatch) {
        return compareVersions(current, parseVersion(minimumMatch[1])) >= 0;
      }

      const compatibleMatch = part.match(/^\^(\d+\.\d+\.\d+)$/);
      if (compatibleMatch) {
        const minimum = parseVersion(compatibleMatch[1]);
        return (
          current[0] === minimum[0] && compareVersions(current, minimum) >= 0
        );
      }

      return false;
    });
}

export function expectedPnpmVersion(packageManager) {
  const match = String(packageManager).match(/^pnpm@(.+)$/);
  return match?.[1] || '';
}

export function assessWorkspace(snapshot, mode = 'development') {
  if (!WORKSPACE_MODES.has(mode)) {
    throw new Error(`Unknown workspace doctor mode: ${mode}`);
  }

  const checks = [];
  checks.push(
    result(
      'Git repository root',
      snapshot.cwd === snapshot.root,
      snapshot.cwd === snapshot.root
        ? snapshot.root
        : `running from ${snapshot.cwd}; repository root is ${snapshot.root}`,
      `cd ${snapshot.root}`
    )
  );
  checks.push(
    result(
      'Working tree is clean',
      snapshot.status.length === 0,
      snapshot.status.length === 0
        ? 'no tracked or untracked changes'
        : `${snapshot.status.length} changed path(s)`,
      'Move intentional work to a task branch and commit it; remove generated leftovers before syncing or deploying.'
    )
  );
  checks.push(
    result(
      'Origin remote is configured',
      Boolean(snapshot.originUrl),
      snapshot.originUrl || 'origin is missing',
      'Configure the canonical GitHub repository as origin.'
    )
  );
  checks.push(
    result(
      'Node runtime matches package.json',
      satisfiesNodeEngine(snapshot.nodeVersion, snapshot.nodeEngine),
      `${snapshot.nodeVersion} against ${snapshot.nodeEngine}`,
      `Use a Node version matching ${snapshot.nodeEngine}.`
    )
  );

  const expectedPnpm = expectedPnpmVersion(snapshot.packageManager);
  checks.push(
    result(
      'pnpm runtime matches package.json',
      Boolean(expectedPnpm) && snapshot.pnpmVersion === expectedPnpm,
      `${snapshot.pnpmVersion || 'missing'} against ${expectedPnpm || 'unspecified'}`,
      expectedPnpm
        ? `Run corepack prepare pnpm@${expectedPnpm} --activate.`
        : 'Declare packageManager in package.json.'
    )
  );

  const onMain = snapshot.branch === 'main';
  const detached = snapshot.branch === '';
  const matchesMain = snapshot.head === snapshot.originMain;
  if (mode === 'development') {
    checks.push(
      result(
        'Development branch is isolated',
        !onMain && !detached,
        snapshot.branch || 'detached HEAD',
        'Create a codex/<task> branch in its own worktree before editing.'
      )
    );
    checks.push(
      result(
        'Development base is current',
        snapshot.behindMain === 0,
        `${snapshot.aheadMain} ahead / ${snapshot.behindMain} behind origin/main`,
        'Rebase or recreate the task worktree from origin/main before editing.'
      )
    );
  } else {
    checks.push(
      result(
        'Mainline commit is exact',
        matchesMain,
        `HEAD ${snapshot.head.slice(0, 12)} / origin/main ${snapshot.originMain.slice(0, 12)}`,
        'Fetch origin and fast-forward main. Never deploy an unpushed or divergent commit.'
      )
    );
    checks.push(
      result(
        mode === 'deploy'
          ? 'Deployment branch is main or detached'
          : 'Sync branch is main',
        mode === 'deploy' ? onMain || detached : onMain,
        snapshot.branch || 'detached HEAD',
        mode === 'deploy'
          ? 'Deploy from main or a detached clean release worktree at origin/main.'
          : 'Switch to main before synchronizing the canonical checkout.'
      )
    );
  }

  if (mode === 'deploy') {
    checks.push(
      result(
        'Cloudflare workers credential is configured',
        snapshot.cloudflareWorkersConfigured,
        snapshot.cloudflareWorkersConfigured
          ? 'canonical credential store contains the workers role'
          : 'workers role is missing',
        'Run pnpm cf:credentials:init and configure the workers role.'
      )
    );
  }

  return {
    mode,
    ok: checks.every((check) => check.ok),
    checks,
    summary: {
      branch: snapshot.branch || 'detached',
      head: snapshot.head,
      originMain: snapshot.originMain,
      aheadMain: snapshot.aheadMain,
      behindMain: snapshot.behindMain
    }
  };
}
