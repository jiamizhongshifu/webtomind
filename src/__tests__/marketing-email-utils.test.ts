import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildResendBatchIdempotencyKey,
  getMarketingEmailBackoffMs,
  isResendDailyQuotaError,
  normalizeQueuedPricingCta,
  resolveMarketingEmailDrainLimit
} from '../../api/marketing/email-drain';
import {
  chunkMarketingEmailRows,
  extractCampaignEnqueueJobs,
  isMarketingEmailSchedulerValidationRequest
} from '../../api/marketing/email-scheduler';
import {
  isMarketingEmailTypeEnabled,
  MarketingEmailPreference,
  MarketingEmailType,
  renderEmailLayout
} from '../../api/marketing/email-utils';
import { sendBatchViaResend } from '../../api/marketing/email-worker-utils';
import { verifyResendWebhookSignature } from '../../api/marketing/resend-webhook';

const basePreference: MarketingEmailPreference = {
  user_id: 'user-1',
  email: 'user@example.com',
  locale: 'zh-CN',
  unsubscribe_token: 'token-1',
  welcome_enabled: true,
  case_digest_enabled: true,
  offer_enabled: true,
  unsubscribed_at: null
};

describe('isMarketingEmailTypeEnabled', () => {
  it.each<{
    type: MarketingEmailType;
    disabledColumn: keyof Pick<
      MarketingEmailPreference,
      'welcome_enabled' | 'case_digest_enabled' | 'offer_enabled'
    >;
  }>([
    { type: 'welcome', disabledColumn: 'welcome_enabled' },
    { type: 'case_digest', disabledColumn: 'case_digest_enabled' },
    { type: 'limited_offer', disabledColumn: 'offer_enabled' }
  ])('checks the %s opt-in flag before sending', ({ type, disabledColumn }) => {
    expect(isMarketingEmailTypeEnabled(basePreference, type)).toBe(true);

    expect(
      isMarketingEmailTypeEnabled(
        {
          ...basePreference,
          [disabledColumn]: false
        },
        type
      )
    ).toBe(false);
  });

  it('blocks all marketing email types after unsubscribe', () => {
    const unsubscribed = {
      ...basePreference,
      unsubscribed_at: '2026-06-06T00:00:00.000Z'
    };

    expect(isMarketingEmailTypeEnabled(unsubscribed, 'welcome')).toBe(false);
    expect(isMarketingEmailTypeEnabled(unsubscribed, 'case_digest')).toBe(
      false
    );
    expect(isMarketingEmailTypeEnabled(unsubscribed, 'limited_offer')).toBe(
      false
    );
  });
});

describe('campaign enqueue jobs', () => {
  it('extracts and deduplicates Cloudflare queue campaign jobs', () => {
    const jobs = extractCampaignEnqueueJobs({
      source: 'cloudflare-queue',
      messages: [
        {
          id: 'msg-1',
          body: {
            type: 'campaign_enqueue',
            jobId: 'campaign_enqueue:15 1 * * *:1781485200000',
            cron: '15 1 * * *',
            scheduledTime: 1781485200000,
            dateKey: '2026-06-15',
            emailTypes: ['case_digest', 'unsupported'],
            segment: 'generic'
          }
        },
        {
          id: 'msg-duplicate',
          body: {
            type: 'campaign_enqueue',
            jobId: 'campaign_enqueue:15 1 * * *:1781485200000',
            emailTypes: ['limited_offer']
          }
        }
      ]
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: 'campaign_enqueue',
      dateKey: '2026-06-15',
      emailTypes: ['case_digest'],
      segment: 'generic'
    });
  });

  it('recognizes explicit scheduler validation without queuing mail', () => {
    expect(
      isMarketingEmailSchedulerValidationRequest({
        url: 'https://webtomind.com/api/marketing/email-scheduler?mode=validate'
      })
    ).toBe(true);
    expect(
      isMarketingEmailSchedulerValidationRequest({
        body: { mode: 'validate' }
      })
    ).toBe(true);
    expect(
      isMarketingEmailSchedulerValidationRequest({
        url: 'https://webtomind.com/api/marketing/email-scheduler'
      })
    ).toBe(false);
  });
});

describe('marketing email queue batching', () => {
  it('splits large HTML queue payloads into bounded idempotent writes', () => {
    const rows = Array.from({ length: 53 }, (_, index) => ({ index }));

    expect(
      chunkMarketingEmailRows(rows, 25).map((batch) => batch.length)
    ).toEqual([25, 25, 3]);
    expect(chunkMarketingEmailRows([], 25)).toEqual([]);
    expect(chunkMarketingEmailRows(rows.slice(0, 2), 0)).toHaveLength(2);
  });

  it('keeps the queue conflict index inferable by PostgREST upserts', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260729013000_fix_marketing_email_queue_conflict_index.sql'
      ),
      'utf8'
    );

    expect(sql).toContain(
      'ON public.marketing_email_queue (recipient_email, email_type, campaign_key)'
    );
    expect(sql).not.toMatch(
      /CREATE UNIQUE INDEX[\s\S]*WHERE campaign_key IS NOT NULL/
    );
  });

  it('adds delivery-event storage and a transaction-safe queue canary', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260805064500_marketing_email_delivery_events.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('marketing_email_provider_events');
    expect(sql).toContain('record_marketing_email_provider_event');
    expect(sql).toContain('refresh_marketing_email_campaign_status');
    expect(sql).toContain('verify_marketing_email_queue_upsert_contract');
    expect(sql).toContain('campaign_had_no_queue_rows');
    expect(sql).toContain('v_recipient_email := COALESCE');
    expect(sql).toContain("NULLIF(btrim(p_recipient_email), '')");
    expect(sql).toContain('idx_marketing_email_queue_provider_message');
    expect(sql).toContain(
      'ON CONFLICT (recipient_email, email_type, campaign_key)'
    );
    expect(sql).toContain('DELETE FROM public.marketing_email_queue');
  });

  it('keeps every Supabase migration version unique', () => {
    const migrationFiles = readdirSync(
      resolve(process.cwd(), 'supabase/migrations')
    ).filter((file) => /^\d+_.*\.sql$/.test(file));
    const versions = migrationFiles.map((file) => file.split('_', 1)[0]);
    const duplicates = versions.filter(
      (version, index) => versions.indexOf(version) !== index
    );

    expect([...new Set(duplicates)]).toEqual([]);
  });
});

describe('marketing email retry backoff', () => {
  it('uses exponential retry delays capped by the configured maximum', () => {
    const previousBase = process.env.MARKETING_EMAIL_RETRY_BASE_SECONDS;
    const previousMax = process.env.MARKETING_EMAIL_RETRY_MAX_SECONDS;
    process.env.MARKETING_EMAIL_RETRY_BASE_SECONDS = '60';
    process.env.MARKETING_EMAIL_RETRY_MAX_SECONDS = '300';

    try {
      expect(getMarketingEmailBackoffMs(1)).toBe(60_000);
      expect(getMarketingEmailBackoffMs(2)).toBe(120_000);
      expect(getMarketingEmailBackoffMs(4)).toBe(300_000);
    } finally {
      if (previousBase === undefined) {
        delete process.env.MARKETING_EMAIL_RETRY_BASE_SECONDS;
      } else {
        process.env.MARKETING_EMAIL_RETRY_BASE_SECONDS = previousBase;
      }
      if (previousMax === undefined) {
        delete process.env.MARKETING_EMAIL_RETRY_MAX_SECONDS;
      } else {
        process.env.MARKETING_EMAIL_RETRY_MAX_SECONDS = previousMax;
      }
    }
  });

  it('recognizes Resend daily quota failures for deferred retry', () => {
    expect(
      isResendDailyQuotaError(
        'You have exceeded your daily email sending quota.'
      )
    ).toBe(true);
    expect(isResendDailyQuotaError('daily_quota_exceeded')).toBe(true);
    expect(isResendDailyQuotaError('Too many requests')).toBe(false);
  });
});

describe('marketing email drain limit', () => {
  it('caps batches at ten to stay within Worker subrequest limits', () => {
    expect(
      resolveMarketingEmailDrainLimit(
        'https://webtomind.com/api/marketing/email-drain?limit=10',
        50
      )
    ).toBe(10);
    expect(
      resolveMarketingEmailDrainLimit(
        'https://webtomind.com/api/marketing/email-drain?limit=500',
        50
      )
    ).toBe(10);
    expect(
      resolveMarketingEmailDrainLimit(
        'https://webtomind.com/api/marketing/email-drain?limit=0',
        50
      )
    ).toBe(10);
  });
});

describe('queued marketing email pricing links', () => {
  it('rewrites rendered legacy pricing CTAs before Resend delivery', () => {
    const oldUrl =
      'https://webtomind.com/zh-CN/create/pricing?source=email_checkout_abandon&utm_source=email&returnTo=%2Fzh-CN%2Fcreate';
    const result = normalizeQueuedPricingCta({
      cta_url: oldUrl,
      html: `<a href="${oldUrl.split('&').join('&amp;')}">查看套餐</a>`,
      text_body: `查看套餐：${oldUrl}`
    });

    expect(result.html).toContain(
      'https://webtomind.com/zh-CN/pricing?source=email_checkout_abandon&amp;utm_source=email'
    );
    expect(result.html).not.toContain('/create/pricing');
    expect(result.html).not.toContain('returnTo');
    expect(result.textBody).toContain(
      'https://webtomind.com/zh-CN/pricing?source=email_checkout_abandon&utm_source=email'
    );
  });

  it('does not rewrite external or unrelated CTAs', () => {
    const externalUrl =
      'https://example.com/zh-CN/create/pricing?returnTo=%2Fprivate';
    const item = {
      cta_url: externalUrl,
      html: `<a href="${externalUrl}">External</a>`,
      text_body: externalUrl
    };

    expect(normalizeQueuedPricingCta(item)).toEqual({
      html: item.html,
      textBody: item.text_body
    });
  });
});

describe('Resend webhook verification', () => {
  it('accepts a current valid Svix signature and rejects tampering', async () => {
    const payload = JSON.stringify({ type: 'webhook.test' });
    const secretBytes = new TextEncoder().encode('webtomind-test-secret');
    const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
    const svixId = 'msg_test_webhook';
    const nowMs = Date.UTC(2026, 6, 29, 3, 0, 0);
    const svixTimestamp = String(Math.floor(nowMs / 1000));
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signed = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${svixId}.${svixTimestamp}.${payload}`)
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(signed)));
    const input = {
      payload,
      svixId,
      svixTimestamp,
      svixSignature: `v1,${signature}`,
      secret,
      nowMs
    };

    await expect(verifyResendWebhookSignature(input)).resolves.toBe(true);
    await expect(
      verifyResendWebhookSignature({ ...input, payload: `${payload} ` })
    ).resolves.toBe(false);
    await expect(
      verifyResendWebhookSignature({
        ...input,
        nowMs: nowMs + 6 * 60 * 1000
      })
    ).resolves.toBe(false);
  });
});

describe('Resend batch idempotency', () => {
  it('builds the same bounded key regardless of queue row order', async () => {
    const first = await buildResendBatchIdempotencyKey(['queue-b', 'queue-a']);
    const second = await buildResendBatchIdempotencyKey(['queue-a', 'queue-b']);

    expect(first).toBe(second);
    expect(first).toMatch(/^marketing-email-batch\/[a-f0-9]{64}$/);
    expect(first.length).toBeLessThan(256);
  });

  it('uses one batch request and preserves per-email provider ids', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: [{ id: 'provider-1' }, { id: 'provider-2' }]
      })
    );

    try {
      const result = await sendBatchViaResend(
        [
          {
            to: 'first@example.com',
            subject: 'First',
            html: '<p>First</p>',
            text: 'First'
          },
          {
            to: 'second@example.com',
            subject: 'Second',
            html: '<p>Second</p>',
            text: 'Second'
          }
        ],
        'marketing-email-batch/test'
      );

      expect(result).toEqual([{ id: 'provider-1' }, { id: 'provider-2' }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails/batch',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': 'marketing-email-batch/test'
          })
        })
      );
    } finally {
      fetchMock.mockRestore();
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });
});

describe('welcome email template migration', () => {
  it('uses bilingual welcome copy and current public prompt library URLs', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260624103000_refresh_welcome_email_bilingual.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('欢迎来到 WebToMind / Welcome to WebToMind');
    expect(sql).toContain('Welcome to WebToMind / 欢迎来到 WebToMind');
    expect(sql).toContain('https://webtomind.com/zh-CN/prompts');
    expect(sql).toContain('https://webtomind.com/en-US/prompts');
    expect(sql).toContain('templateVersion');
    expect(sql).not.toContain('/zh-CN/create/prompts');
    expect(sql).not.toContain('/en-US/create/prompts');
  });
});

describe('marketing email layout', () => {
  it('uses the same branded shell as the welcome email for digest templates', () => {
    const html = renderEmailLayout(
      {
        subject: '本周 AI 图片生成精品案例合集',
        previewText: '精选可直接复用的提示词案例。',
        title: '本周精品案例合集',
        intro: '帮你整理了一组可复用的 AI 图片生成案例。',
        bodyHtml: '<p>案例内容</p>',
        textBody: '本周精品案例合集',
        ctaLabel: '查看全部案例 / Browse Cases',
        ctaUrl: 'https://webtomind.com/zh-CN/prompts'
      },
      'https://webtomind.com/api/marketing/unsubscribe?token=test'
    );

    expect(html).toContain('background:#f4f7ff');
    expect(html).toContain('WebToMind Visual Prompt OS');
    expect(html).toContain(
      'linear-gradient(135deg,#0048ff 0%,#ff3ccf 56%,#d8ff2e 100%)'
    );
    expect(html).toContain('box-shadow:6px 6px 0 #d8ff2e');
    expect(html).toContain('退订邮件 / Unsubscribe');
    expect(html).not.toContain('background:#fffaf0');
    expect(html).not.toContain('border:1px solid #e9dfcf');
  });
});
