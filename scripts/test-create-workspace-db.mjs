import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const containerName = `webtomind-create-workspace-test-${process.pid}`;
const postgresImage =
  process.env.CREATE_WORKSPACE_TEST_POSTGRES_IMAGE || 'postgres:16-alpine';

const sqlFiles = [
  'supabase/tests/create_workspace_v2_fixture.sql',
  'supabase/migrations/20260605101500_image_reference_assets.sql',
  'supabase/migrations/20260715170000_visual_moodboards_and_image_sessions.sql',
  'supabase/migrations/20260715180000_visual_moodboard_reference_assets.sql',
  'supabase/migrations/20260717090000_visual_moodboard_copy_provenance.sql',
  'supabase/tests/create_workspace_v2_rls.sql',
  'supabase/tests/create_workspace_v2_rollback.sql'
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    input: options.input,
    env: process.env
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed\n${output}`);
  }
  return String(result.stdout || '').trim();
}

function applySql(relativePath) {
  const sql = readFileSync(resolve(root, relativePath), 'utf8');
  const output = run(
    'docker',
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres'
    ],
    { input: sql }
  );
  console.log(`[create-workspace-db] applied ${relativePath}`);
  if (output.includes('_ok')) console.log(output.split('\n').at(-1));
}

function waitForPostgres() {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = spawnSync(
      'docker',
      ['exec', containerName, 'pg_isready', '-U', 'postgres'],
      { stdio: 'ignore' }
    );
    consecutiveReadyChecks = ready.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error('isolated PostgreSQL did not become ready');
}

try {
  run('docker', ['version', '--format', '{{.Server.Version}}']);
  run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--env',
    'POSTGRES_PASSWORD=postgres',
    postgresImage
  ]);
  waitForPostgres();
  for (const sqlFile of sqlFiles) applySql(sqlFile);
  console.log(
    '[create-workspace-db] migration, RLS, trigger, and rollback rehearsal passed'
  );
} finally {
  spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
}
