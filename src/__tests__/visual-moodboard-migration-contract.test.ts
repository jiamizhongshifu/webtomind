import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260715170000_visual_moodboards_and_image_sessions.sql'
  ),
  'utf8'
);
const analyzeHandler = readFileSync(
  join(process.cwd(), 'api/moodboards/[id]/analyze.ts'),
  'utf8'
);
const referenceMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260715180000_visual_moodboard_reference_assets.sql'
  ),
  'utf8'
);
const copyProvenanceMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260717090000_visual_moodboard_copy_provenance.sql'
  ),
  'utf8'
);
const moodboardSharedQuery = readFileSync(
  join(process.cwd(), 'api/moodboards/shared.ts'),
  'utf8'
);

describe('visual moodboard migration contract', () => {
  it('keeps visual context separate from knowledge boards', () => {
    for (const table of [
      'visual_moodboards',
      'visual_moodboard_items',
      'visual_moodboard_shares',
      'image_creation_sessions',
      'image_creation_turns'
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).not.toMatch(/ALTER TABLE public\.workspace_projects/i);
  });

  it('enforces private-by-default visibility, bounded items, and stale analysis', () => {
    expect(migration).toMatch(/visibility TEXT NOT NULL DEFAULT 'private'/);
    expect(migration).toMatch(/item limit reached/);
    expect(migration).toMatch(/>= 24/);
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/mark_visual_moodboard_analysis_stale/);
    expect(migration).toMatch(/analysis_version > 0 THEN 'stale'/);
  });

  it('keeps cover items inside their owning moodboard', () => {
    expect(migration).toMatch(/enforce_visual_moodboard_cover_item/);
    expect(migration).toMatch(
      /item\.id = NEW\.cover_item_id[\s\S]*item\.moodboard_id = NEW\.id/
    );
    expect(migration).toMatch(
      /CREATE CONSTRAINT TRIGGER visual_moodboard_cover_item_contract[\s\S]*DEFERRABLE INITIALLY DEFERRED/
    );
  });

  it('disambiguates the item relationship from the cover relationship', () => {
    expect(moodboardSharedQuery).toContain(
      'visual_moodboard_items!visual_moodboard_items_moodboard_id_fkey'
    );
  });

  it('does not commit an analysis after its items changed', () => {
    expect(analyzeHandler).toMatch(
      /\.eq\('analysis_version', expectedVersion\)[\s\S]*?\.neq\('analysis_status', 'analyzing'\)[\s\S]*?\.select\('id'\)/
    );
    expect(analyzeHandler).toMatch(
      /\.eq\('analysis_version', expectedVersion\)[\s\S]*?\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/
    );
    expect(analyzeHandler).toMatch(
      /\.eq\('analysis_version', expectedVersion\)\s*\.eq\('analysis_status', 'analyzing'\)/
    );
  });

  it('separates generation references from durable media metadata', () => {
    expect(referenceMigration).toMatch(
      /ADD COLUMN IF NOT EXISTS image_reference_id UUID/
    );
    expect(referenceMigration).toMatch(
      /REFERENCES public\.image_reference_assets\(id\)/
    );
    expect(referenceMigration).toMatch(/visual_moodboard_items_reference_idx/);
    expect(referenceMigration).toMatch(
      /enforce_visual_moodboard_asset_ownership/
    );
    expect(referenceMigration).toMatch(
      /asset\.user_id = board\.user_id[\s\S]*media\.user_id = board\.user_id/
    );
    expect(referenceMigration).toMatch(
      /UPDATE OF[\s\S]*source,[\s\S]*metadata[\s\S]*mark_visual_moodboard_analysis_stale/
    );
    const staleTrigger = referenceMigration.match(
      /CREATE TRIGGER visual_moodboard_items_stale[\s\S]*?mark_visual_moodboard_analysis_stale\(\);/
    )?.[0];
    expect(staleTrigger).toBeTruthy();
    expect(staleTrigger).not.toContain('image_reference_id');
  });

  it('enables RLS on every new user-data table', () => {
    for (const table of [
      'visual_moodboards',
      'visual_moodboard_items',
      'visual_moodboard_shares',
      'image_creation_sessions',
      'image_creation_turns'
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`
      );
    }
  });

  it('limits discovery to active public boards and writes to owners', () => {
    expect(migration).toMatch(
      /visibility = 'public' AND moderation_status = 'active'/
    );
    expect(migration).toMatch(
      /visual_moodboards_owner_update[\s\S]*user_id = \(SELECT auth\.uid\(\)\) AND NOT is_official/
    );
    expect(migration).toMatch(
      /visual_moodboard_items_owner_write[\s\S]*b\.user_id = \(SELECT auth\.uid\(\)\) AND NOT b\.is_official/
    );
    expect(migration).toMatch(
      /image_creation_sessions_owner_all[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/
    );
    expect(migration).toMatch(
      /image_creation_turns_owner_all[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/
    );
    expect(migration).toMatch(
      /image_creation_turns_session_owner_fkey[\s\S]*FOREIGN KEY \(session_id, user_id\)/
    );
  });

  it('makes share links revocable without exposing the token through RLS', () => {
    expect(migration).toMatch(/token TEXT NOT NULL UNIQUE/);
    expect(migration).toMatch(/revoked_at TIMESTAMPTZ/);
    expect(migration).toMatch(
      /visual_moodboard_shares_owner_all[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/
    );
    expect(migration).toMatch(
      /visual_moodboard_shares_owner_fkey[\s\S]*FOREIGN KEY \(moodboard_id, user_id\)/
    );
    expect(migration).not.toMatch(
      /visual_moodboard_shares[^\n]*FOR SELECT[\s\S]*token/i
    );
  });

  it('allows at most one personal copy of each source moodboard', () => {
    expect(copyProvenanceMigration).toMatch(
      /ADD COLUMN IF NOT EXISTS source_moodboard_id UUID/
    );
    expect(copyProvenanceMigration).toMatch(
      /REFERENCES public\.visual_moodboards\(id\)[\s\S]*ON DELETE SET NULL/
    );
    expect(copyProvenanceMigration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS visual_moodboards_user_source_unique[\s\S]*\(user_id, source_moodboard_id\)/
    );
  });
});
