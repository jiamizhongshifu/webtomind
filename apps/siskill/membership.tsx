import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '../../src/shared/ui';
import { client } from './auth-client';
type Plan = { id: string; amount: number; currency: string; interval: string };
type Status = {
  active: boolean;
  status: string;
  billingStatus?: string;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  membership: {
    id: string;
    plan: string;
    amount: number;
    currency: string;
  } | null;
  releases?: { id: string; slug: string; version: string }[];
};
async function request(path: string, body?: unknown) {
  const sdk = await client(),
    { data } = await sdk.auth.getSession();
  if (!data.session) throw Error('AUTH_REQUIRED');
  const response = await fetch('/api/siskill/' + path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
}
export function MemberPlanButton({
  yearly,
  locale
}: {
  yearly: boolean;
  locale: string;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/siskill/plans', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (active && v?.membershipOpen) setPlans(v.plans);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const plan = plans.find(
    (p) => p.id === (yearly ? 'pro_yearly' : 'pro_monthly')
  );
  return plan ? (
    <ButtonLink variant="primary" to={`/${locale}/account?plan=${plan.id}`}>
      {locale === 'zh-CN' ? '选择 Pro 会员' : 'Choose Pro'}
    </ButtonLink>
  ) : (
    <Button variant="primary" disabled>
      {locale === 'zh-CN' ? '即将开放' : 'Coming soon'}
    </Button>
  );
}
export function MembershipPanel({
  locale,
  onDownload
}: {
  locale: string;
  onDownload: (grant: {
    release_id: string;
    siskill_releases: { slug: string; version: string };
  }) => void;
}) {
  const zh = locale === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [plans, setPlans] = useState<Plan[]>([]);
  const selected = new URLSearchParams(window.location.search).get('plan');
  const [planId] = useState(() => {
    try {
      if (selected && ['pro_monthly', 'pro_yearly'].includes(selected))
        sessionStorage.setItem('siskill.pending-plan', selected);
      return selected || sessionStorage.getItem('siskill.pending-plan');
    } catch {
      return selected;
    }
  });
  const plan = plans.find((p) => p.id === planId);
  async function refresh() {
    setError(false);
    try {
      setStatus(await request('membership'));
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    let active = true;
    request('membership')
      .then((v) => {
        if (active) setStatus(v);
      })
      .catch(() => {
        if (active) setError(true);
      });
    fetch('/api/siskill/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (active && v?.membershipOpen) setPlans(v.plans);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function action(cancel?: boolean) {
    setBusy(true);
    setError(false);
    try {
      if (cancel === undefined) {
        const checkoutPlan =
          status?.status === 'pending' ? status.membership?.plan : plan?.id;
        if (!checkoutPlan) return;
        const data = await request('membership/checkout', {
          plan: checkoutPlan,
          locale
        });
        const url = new URL(data.url);
        if (
          url.origin !== 'https://checkout.stripe.com' ||
          url.username ||
          url.password
        )
          throw Error('INVALID_CHECKOUT');
        window.location.assign(url.href);
      } else {
        await request('membership/renewal', { cancelAtPeriodEnd: cancel });
        setConfirm(false);
        await refresh();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const date = status?.periodEnd
    ? new Date(status.periodEnd * 1000).toLocaleDateString(locale)
    : '';
  return (
    <section className="siskill-member-panel" aria-busy={busy}>
      <h2>{t('SiSkill Pro membership', 'SiSkill Pro 会员')}</h2>
      {error ? (
        <p role="alert">
          {t(
            'Membership status could not be verified. Please retry.',
            '暂时无法核实会员状态，请重试。'
          )}{' '}
          <button onClick={refresh}>{t('Retry', '重试')}</button>
        </p>
      ) : !status ? (
        <p role="status">{t('Checking membership…', '正在核实会员…')}</p>
      ) : (
        <>
          <p>
            {status.active
              ? t('Your studio library is unlocked.', '自营 Pro 下载库已解锁。')
              : status.status === 'none'
                ? t(
                    'No SiSkill Pro membership yet.',
                    '尚未开通 SiSkill Pro 会员。'
                  )
                : t(
                    'Your membership currently has no download access.',
                    '当前会员状态暂无下载权限。'
                  )}
          </p>
          {status.membership && (
            <p>
              {status.membership.plan === 'pro_yearly'
                ? t('Yearly plan', '年付会员')
                : t('Monthly plan', '月付会员')}{' '}
              ·{' '}
              {new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: status.membership.currency
              }).format(status.membership.amount / 100)}
              {date &&
                ` · ${status.cancelAtPeriodEnd ? t('Ends on', '于以下日期结束') : t('Current period ends', '本期截至')} ${date}`}
            </p>
          )}
          {status.membership &&
            ['active', 'past_due'].includes(
              status.billingStatus || status.status
            ) &&
            (status.cancelAtPeriodEnd ? (
              <Button disabled={busy} onClick={() => action(false)}>
                {t('Resume renewal', '恢复续费')}
              </Button>
            ) : confirm ? (
              <div
                role="group"
                aria-label={t('Confirm cancellation', '确认取消续费')}
              >
                <p>
                  {t(
                    'Cancel automatic renewal? Access continues through the paid period. This does not issue a refund.',
                    '取消自动续费？已支付期限内继续保留访问权，此操作不会发起退款。'
                  )}
                </p>
                <Button disabled={busy} onClick={() => action(true)}>
                  {t('Confirm cancel renewal', '确认取消续费')}
                </Button>
                <Button disabled={busy} onClick={() => setConfirm(false)}>
                  {t('Keep membership', '保留续费')}
                </Button>
              </div>
            ) : (
              <Button disabled={busy} onClick={() => setConfirm(true)}>
                {t('Cancel renewal', '取消续费')}
              </Button>
            ))}
          {status.active &&
            status.releases?.map((r) => (
              <div className="siskill-library-item" key={r.id}>
                <p>
                  {r.slug} · v{r.version}
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    onDownload({ release_id: r.id, siskill_releases: r })
                  }
                >
                  {t('Download Skill', '下载 Skill')}
                </Button>
              </div>
            ))}
          {status.status === 'pending' && status.membership && (
            <Button disabled={busy} onClick={() => action()}>
              {t('Continue pending checkout', '继续未完成的结账')}
            </Button>
          )}
          {plan && !status.membership && (
            <div>
              <p>
                {t('Subscribe for', '订阅价格')}{' '}
                {new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: plan.currency
                }).format(plan.amount / 100)}{' '}
                {plan.interval === 'year'
                  ? t('per year', '每年')
                  : t('per month', '每月')}
              </p>
              <p>
                {t(
                  'Currently includes 3 published Pro Skills: Customer Case Study Deck, NotebookLM Video and Creator Content Workflow. Renews automatically. Cancel before renewal in this account. Includes published studio Pro Skills and updates during your paid period. Model costs, third-party Skills and WebToMind benefits are separate.',
                  '目前包含 3 个已发布 Pro Skill：客户案例 Deck、NotebookLM 视频生成、自媒体内容工作流。自动续费，可在本账号中于续费前取消。有效期内包含已发布的自营 Pro Skill 与更新；模型费用、第三方 Skill 与 WebToMind 权益另计。'
                )}
              </p>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => action()}
              >
                {t('Continue to secure checkout', '前往安全结账')}
              </Button>
            </div>
          )}
          {!status.membership && !plan && (
            <ButtonLink to={`/${locale}/skills/pricing`}>
              {t('View membership plans', '查看会员方案')}
            </ButtonLink>
          )}
        </>
      )}
    </section>
  );
}
