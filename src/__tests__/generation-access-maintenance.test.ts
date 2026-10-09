// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';

it('preserves owner isolation and trigger execution after privilege hardening', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('app.user_id')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE image_generation_tasks(id uuid, user_id uuid, generation_id uuid, updated_at timestamptz);
      CREATE TABLE video_generation_tasks(id uuid, user_id uuid);
      CREATE TABLE image_creation_turns(user_id uuid);
      CREATE TABLE user_subscriptions(plan_id text);
      ALTER TABLE image_generation_tasks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE video_generation_tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY image_generation_tasks_owner_read ON image_generation_tasks FOR SELECT TO authenticated USING(auth.uid()=user_id);
      CREATE POLICY video_generation_tasks_owner_select ON video_generation_tasks FOR SELECT TO authenticated USING(auth.uid()=user_id);
      CREATE POLICY owner_update ON image_generation_tasks FOR UPDATE TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
      GRANT SELECT, UPDATE ON image_generation_tasks TO authenticated;
      GRANT SELECT ON video_generation_tasks TO authenticated;
      CREATE FUNCTION touch_create_workspace_v2_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END $$;
      CREATE TRIGGER touch BEFORE UPDATE ON image_generation_tasks FOR EACH ROW EXECUTE FUNCTION touch_create_workspace_v2_updated_at();
      INSERT INTO image_generation_tasks VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null,null), ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',null,null);
      INSERT INTO video_generation_tasks SELECT id,user_id FROM image_generation_tasks;
    `);
    for (const name of [
      'enforce_visual_moodboard_asset_ownership',
      'enforce_visual_moodboard_cover_item',
      'enforce_visual_moodboard_item_limit',
      'mark_visual_moodboard_analysis_stale'
    ]) {
      await db.exec(
        `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER ${name} BEFORE UPDATE ON image_generation_tasks FOR EACH ROW EXECUTE FUNCTION ${name}();`
      );
    }
    const migration = readFileSync(
      new URL(
        '../../supabase/migrations/20261009143609_harden_generation_access_and_indexes.sql',
        import.meta.url
      ),
      'utf8'
    );
    await db.exec(`BEGIN; ${migration} COMMIT;`);
    await db.exec(
      `SET ROLE authenticated; SET app.user_id='00000000-0000-0000-0000-000000000001';`
    );
    expect(
      (await db.query('SELECT id FROM image_generation_tasks')).rows
    ).toHaveLength(1);
    expect(
      (await db.query('SELECT id FROM video_generation_tasks')).rows
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          'UPDATE image_generation_tasks SET generation_id=null RETURNING updated_at'
        )
      ).rows
    ).toHaveLength(1);
    const permissions = await db.query<{ allowed: boolean }>(
      "SELECT has_function_privilege('authenticated','enforce_visual_moodboard_asset_ownership()','execute') allowed"
    );
    expect(permissions.rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
});
