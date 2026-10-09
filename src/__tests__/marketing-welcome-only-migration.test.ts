// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20261009065217_keep_only_welcome_marketing_emails.sql',
    import.meta.url
  ),
  'utf8'
);
const welcome = readFileSync(
  new URL(
    '../../supabase/migrations/20260624103000_refresh_welcome_email_bilingual.sql',
    import.meta.url
  ),
  'utf8'
);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE TABLE marketing_email_preferences (
      user_id uuid PRIMARY KEY, email text, locale text,
      welcome_enabled boolean DEFAULT true, case_digest_enabled boolean DEFAULT true,
      offer_enabled boolean DEFAULT true, unsubscribed_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE marketing_email_leads (
      email text PRIMARY KEY, case_digest_enabled boolean DEFAULT true, offer_enabled boolean DEFAULT false
    );
    CREATE TABLE marketing_email_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, recipient_email text,
      email_type text, subject text, preview_text text, html text, text_body text,
      cta_label text, cta_url text, campaign_key text, metadata jsonb,
      status text DEFAULT 'queued', last_error text, leased_until timestamptz, next_attempt_at timestamptz,
      UNIQUE(recipient_email, email_type, campaign_key)
    );
    CREATE TABLE marketing_email_campaigns (email_type text, status text);
    INSERT INTO marketing_email_queue(email_type, status)
      VALUES ('case_digest', 'queued'), ('limited_offer', 'sending'), ('case_digest', 'sent'), ('welcome', 'queued');
    INSERT INTO marketing_email_campaigns VALUES ('case_digest', 'queued'), ('limited_offer', 'sent');
    INSERT INTO marketing_email_preferences(user_id, welcome_enabled, unsubscribed_at)
      VALUES ('00000000-0000-0000-0000-000000000001', false, '2026-10-01');
  `);
  await db.exec(welcome);
  await db.exec(`CREATE TRIGGER on_auth_user_created_marketing_email AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_marketing_email();`);
  await db.exec(migration);
});
afterAll(async () => {
  await db?.close();
});

describe('welcome-only production migration', () => {
  it('cancels pending recurring mail while preserving welcome and sent history', async () => {
    const { rows } = await db.query(
      'SELECT email_type, status FROM marketing_email_queue ORDER BY email_type,status'
    );
    expect(rows).toEqual([
      { email_type: 'case_digest', status: 'failed' },
      { email_type: 'case_digest', status: 'sent' },
      { email_type: 'limited_offer', status: 'failed' },
      { email_type: 'welcome', status: 'queued' }
    ]);
    expect(
      (
        await db.query(
          'SELECT status FROM marketing_email_campaigns ORDER BY email_type'
        )
      ).rows
    ).toEqual([{ status: 'paused' }, { status: 'sent' }]);
  });

  it('blocks old scheduler upserts and drain claims without breaking queue canaries', async () => {
    for (const type of ['case_digest', 'limited_offer']) {
      const { rows } = await db.query<{ id: string; status: string }>(
        `
        INSERT INTO marketing_email_queue(recipient_email,email_type,campaign_key,status)
        VALUES ('canary@example.test',$1,'canary','queued')
        ON CONFLICT(recipient_email,email_type,campaign_key) DO UPDATE SET status='queued'
        RETURNING id,status`,
        [type]
      );
      expect(rows[0].status).toBe('failed');
      expect(
        (
          await db.query(
            "UPDATE marketing_email_queue SET status='sending' WHERE id=$1 RETURNING id",
            [rows[0].id]
          )
        ).rows
      ).toEqual([]);
      expect(
        (
          await db.query(
            "INSERT INTO marketing_email_queue(email_type,status) VALUES ($1,'sending') RETURNING id",
            [type]
          )
        ).rows
      ).toEqual([]);
    }
  });

  it('keeps the real signup welcome trigger and welcome claims working', async () => {
    await db.query(`INSERT INTO auth.users VALUES
      ('00000000-0000-0000-0000-000000000002','signup@example.test','{"locale":"en-US"}')`);
    const { rows } = await db.query(
      `SELECT email_type,status FROM marketing_email_queue WHERE recipient_email='signup@example.test'`
    );
    expect(rows).toEqual([{ email_type: 'welcome', status: 'queued' }]);
    expect(
      (
        await db.query(`UPDATE marketing_email_queue SET status='sending'
      WHERE recipient_email='signup@example.test' RETURNING status`)
      ).rows
    ).toEqual([{ status: 'sending' }]);
    expect(
      (
        await db.query(`SELECT welcome_enabled,case_digest_enabled,offer_enabled FROM marketing_email_preferences
      WHERE email='signup@example.test'`)
      ).rows
    ).toEqual([
      {
        welcome_enabled: true,
        case_digest_enabled: false,
        offer_enabled: false
      }
    ]);
  });

  it('preserves opt-outs and prevents legacy subscribe calls from enabling recurring mail', async () => {
    await db.exec(`UPDATE marketing_email_preferences SET case_digest_enabled=true,offer_enabled=true;
      INSERT INTO marketing_email_leads VALUES ('lead@example.test',true,true);`);
    const { rows } = await db.query<{
      welcome_enabled: boolean;
      unsubscribed_at: Date;
    }>(`SELECT welcome_enabled,unsubscribed_at
      FROM marketing_email_preferences WHERE user_id='00000000-0000-0000-0000-000000000001'`);
    expect(rows[0].welcome_enabled).toBe(false);
    expect(rows[0].unsubscribed_at).not.toBeNull();
    expect(
      (
        await db.query(
          'SELECT * FROM marketing_email_preferences WHERE case_digest_enabled OR offer_enabled'
        )
      ).rows
    ).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT * FROM marketing_email_leads WHERE case_digest_enabled OR offer_enabled'
        )
      ).rows
    ).toEqual([]);
    await db.exec(migration);
  });
});
