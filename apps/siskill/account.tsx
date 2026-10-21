import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { client, redirectsReady } from './auth-client';
import freeReleases from './free-releases.json';
import { MembershipPanel } from './membership';
import { type SupabaseClient, type Session } from '@supabase/supabase-js';
import { Button, ButtonLink } from '../../src/shared/ui';

type Mode = 'signin' | 'signup' | 'reset' | 'update';
type Grant = {
  release_id: string;
  downloadable?: boolean;
  siskill_releases: { slug: string; version: string };
};
type Purchase = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  snapshot: { name: string; version: string };
};
type Library = { orders: Purchase[]; grants: Grant[] };
export type Product = {
  sku: string;
  name: string;
  usd_cents: number;
  cny_cents: number;
  contract_version: string;
  siskill_releases: { slug: string; version: string };
};
async function api(path: string, token: string, body?: unknown) {
  const response = await fetch(`/api/siskill/${path}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok)
    throw Error(
      (await response.json().catch(() => ({}))).error || 'COMMERCE_UNAVAILABLE'
    );
  return response;
}
export default function Account({ locale }: { locale: string }) {
  const zh = locale === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  const [sdk, setSdk] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false),
    [attempt, setAttempt] = useState(0),
    [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [library, setLibrary] = useState<Library | null>(null),
    [libraryError, setLibraryError] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [offer, setOffer] = useState<Product | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get('plan');
    if (plan && ['pro_monthly', 'pro_yearly'].includes(plan))
      try {
        sessionStorage.setItem('siskill.pending-plan', plan);
      } catch {
        /* optional */
      }
  }, []);
  const requested = new URLSearchParams(window.location.search).get('order');
  const querySkill = new URLSearchParams(window.location.search).get('skill');
  const [savedSkill] = useState(() => {
    try {
      return sessionStorage.getItem('siskill.pending-skill');
    } catch {
      return null;
    }
  });
  const selected = querySkill || savedSkill;
  useEffect(() => {
    if (selected && /^[a-z0-9-]+$/.test(selected)) {
      try {
        sessionStorage.setItem('siskill.pending-skill', selected);
      } catch {
        /* storage is optional */
      }
    }
  }, [selected]);
  const navigate = useNavigate();
  const [pendingDownload] = useState(() => {
    const query = new URLSearchParams(window.location.search).get('download');
    try {
      if (query && freeReleases.some((r) => r.slug === query))
        sessionStorage.setItem('siskill.pending-download', query);
      return query || sessionStorage.getItem('siskill.pending-download');
    } catch {
      return query;
    }
  });
  useEffect(() => {
    if (
      loaded &&
      session &&
      mode !== 'update' &&
      freeReleases.some((r) => r.slug === pendingDownload)
    ) {
      try {
        sessionStorage.removeItem('siskill.pending-download');
      } catch {
        /* optional */
      }
      navigate(`/${locale}/skills/${pendingDownload}#install`, {
        replace: true
      });
    }
  }, [loaded, session, mode, pendingDownload, locale, navigate]);
  const accessToken = session?.access_token;
  const callback = `${window.location.origin}/${locale}/account`;
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    setLoaded(false);
    setError('');
    client()
      .then(async (c) => {
        if (!active) return;
        setSdk(c);
        subscription = c.auth.onAuthStateChange((event, value) => {
          if (active) {
            setSession(value);
            if (event === 'PASSWORD_RECOVERY') setMode('update');
          }
        }).data.subscription;
        const result = await c.auth.getSession();
        if (!active) return;
        setSession(result.data.session);
        if (
          result.error ||
          new URLSearchParams(window.location.search).has('error')
        )
          setError('AUTH_CALLBACK_FAILED');
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setError('AUTH_UNAVAILABLE');
          setLoaded(true);
        }
      });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [attempt]);
  useEffect(() => {
    let active = true;
    setLibrary(null);
    setLibraryError(false);
    if (accessToken)
      api('me', accessToken)
        .then((r) => r.json())
        .then((data) => {
          if (active) setLibrary(data);
        })
        .catch(() => {
          if (active) setLibraryError(true);
        });
    return () => {
      active = false;
    };
  }, [accessToken, refresh]);
  useEffect(() => {
    let active = true;
    setOffer(null);
    if (selected)
      fetch('/api/siskill/products', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data?.checkoutOpen) {
            setProviders(data.providers || []);
            setOffer(
              data.products.find(
                (p: Product) => p.siskill_releases.slug === selected
              ) || null
            );
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [selected]);
  const owned =
    offer &&
    library?.grants.some(
      (g) => g.siskill_releases.slug === offer.siskill_releases.slug
    );
  function changeMode(value: Mode) {
    setMode(value);
    setPassword('');
    setError('');
    setNotice('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sdk || busy) return;
    if (mode !== 'signin' && !redirectsReady) {
      setError('AUTH_UNAVAILABLE');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const result = await sdk.auth.signInWithPassword({ email, password });
        if (result.error) throw Error('SIGNIN_FAILED');
      } else if (mode === 'signup') {
        const result = await sdk.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback }
        });
        if (result.error) throw Error('SIGNUP_FAILED');
        if (!result.data.session)
          setNotice(
            t(
              'Check your email to confirm your account. Open the link in this browser.',
              '请查收确认邮件，并在当前浏览器打开确认链接。'
            )
          );
      } else if (mode === 'reset') {
        const result = await sdk.auth.resetPasswordForEmail(email, {
          redirectTo: callback
        });
        if (result.error) throw Error('RESET_FAILED');
        setNotice(
          t(
            'If this account supports email recovery, a reset link has been sent. Open it in this browser.',
            '如果该账号支持邮件找回，重置链接已发送，请在当前浏览器打开。'
          )
        );
      } else {
        const result = await sdk.auth.updateUser({ password });
        if (result.error) throw Error('PASSWORD_UPDATE_FAILED');
        setMode('signin');
        setNotice(
          t(
            'Your shared account password has been updated.',
            '共用账号的密码已更新。'
          )
        );
      }
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AUTH_UNAVAILABLE');
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (!sdk || !redirectsReady) return;
    setBusy(true);
    setError('');
    try {
      const result = await sdk.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback }
      });
      if (result.error) throw result.error;
    } catch {
      setError('OAUTH_FAILED');
      setBusy(false);
    }
  }
  async function signout() {
    if (!sdk) return;
    setBusy(true);
    setError('');
    try {
      const result = await sdk.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      setSession(null);
      setLibrary(null);
      setPassword('');
      setNotice('');
      setMode('signin');
    } catch {
      setError('SIGNOUT_FAILED');
    } finally {
      setBusy(false);
    }
  }
  async function checkout(provider: 'stripe' | 'alipay') {
    if (!session || !offer) return;
    setBusy(true);
    setError('');
    try {
      const data = await (
        await api('checkout', session.access_token, {
          sku: offer.sku,
          provider,
          locale
        })
      ).json();
      const url = new URL(data.url);
      if (
        provider === 'stripe' &&
        url.origin === 'https://checkout.stripe.com' &&
        !url.username &&
        !url.password
      ) {
        window.location.assign(url.href);
        return;
      }
      if (
        provider === 'alipay' &&
        url.href === 'https://zpayz.cn/submit.php' &&
        data.method === 'POST'
      ) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url.href;
        for (const [name, value] of Object.entries(data.fields)) {
          if (typeof value !== 'string') throw Error('CHECKOUT_FAILED');
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
        form.remove();
        return;
      }
      throw Error('CHECKOUT_FAILED');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CHECKOUT_FAILED');
      setBusy(false);
    }
  }
  async function download(grant: Grant) {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const response = await api(
        `downloads/${grant.release_id}`,
        session.access_token
      );
      const expected = response.headers.get('X-Content-SHA256');
      const blob = await response.blob();
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
        )
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== expected) throw Error('DOWNLOAD_INTEGRITY_FAILED');
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `${grant.siskill_releases.slug}-${grant.siskill_releases.version}.tar.gz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError('DOWNLOAD_FAILED');
    } finally {
      setBusy(false);
    }
  }
  const message =
    error === 'SIGNIN_FAILED'
      ? t(
          'Email or password could not be verified. Try again or reset your password.',
          '邮箱或密码验证失败，请重试或重置密码。'
        )
      : error === 'ALREADY_OWNED'
        ? t(
            'You already own this Skill. Refresh your library below.',
            '你已拥有此 Skill，请刷新下方下载库。'
          )
        : error === 'AUTH_UNAVAILABLE'
          ? t(
              'Sign-in is temporarily unavailable. Please retry.',
              '登录暂时不可用，请重试。'
            )
          : error === 'DOWNLOAD_FAILED'
            ? t(
                'Download could not be verified. No file was saved; please retry.',
                '下载校验失败，未保存文件，请重试。'
              )
            : error === 'AUTH_CALLBACK_FAILED'
              ? t(
                  'This sign-in link could not be verified. Please sign in again in this browser.',
                  '无法验证此登录链接，请在当前浏览器重新登录。'
                )
              : error
                ? t(
                    'This action could not be completed. Please retry or contact support.',
                    '操作未完成，请重试或联系支持。'
                  )
                : '';
  const labels: Record<string, string> = {
    paid: t('Paid', '已支付'),
    pending: t('Awaiting confirmation', '等待支付确认'),
    refunded: t('Refunded', '已退款'),
    expired: t('Expired', '已过期')
  };
  return (
    <section className="siskill-account" aria-busy={busy || !loaded}>
      <div className="skill-hero">
        <p className="skill-eyebrow">YOUR CREATIVE TOOLKIT</p>
        <h1>{t('Your Skills, ready to work.', '你的 Skill，随时开工。')}</h1>
        <p>
          {t(
            'Use your WebToMind account. Your SiSkill purchases and membership stay separate.',
            '使用现有 WebToMind 账号登录，SiSkill 订单与会员权益独立管理。'
          )}
        </p>
      </div>
      {message && (
        <p role="alert" className="siskill-feedback siskill-feedback--error">
          {message}
        </p>
      )}
      {notice && (
        <p role="status" className="siskill-feedback">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p role="status">{t('Loading your account…', '正在加载账号…')}</p>
      ) : !sdk ? (
        <Button onClick={() => setAttempt((v) => v + 1)}>
          {t('Retry sign-in', '重试登录')}
        </Button>
      ) : !session || mode === 'update' ? (
        <div className="siskill-auth-card">
          <h2>
            {mode === 'signup'
              ? t('Create your shared account', '创建共用账号')
              : mode === 'reset'
                ? t('Reset your password', '重置密码')
                : mode === 'update'
                  ? t('Set a new password', '设置新密码')
                  : t('Welcome back', '欢迎回来')}
          </h2>
          {(mode === 'signin' || mode === 'signup') && (
            <Button
              variant="secondary"
              onClick={google}
              disabled={busy || !redirectsReady}
            >
              {redirectsReady
                ? t('Continue with Google', '使用 Google 继续')
                : t('Google sign-in · Coming soon', 'Google 登录 · 即将开放')}
            </Button>
          )}
          <form onSubmit={submit}>
            {mode !== 'update' && (
              <label>
                {t('Email', '邮箱')}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                {t('Password', '密码')}
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  minLength={mode === 'signin' ? 1 : 8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {mode === 'update' && (
              <p className="skill-muted">
                {t(
                  'This changes the password used by both SiSkill and WebToMind.',
                  '这会同时更新 SiSkill 与 WebToMind 共用账号的密码。'
                )}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy
                ? t('Please wait…', '请稍候…')
                : mode === 'signin'
                  ? t('Sign in', '登录')
                  : mode === 'signup'
                    ? t('Create account', '创建账号')
                    : mode === 'reset'
                      ? t('Send reset link', '发送重置链接')
                      : t('Update password', '更新密码')}
            </Button>
          </form>
          {!redirectsReady && (
            <p className="skill-muted">
              {t(
                'Sign in with your existing email and password. More account options are coming soon.',
                '可使用现有邮箱和密码登录，更多账号选项即将开放。'
              )}
            </p>
          )}
          <div className="siskill-auth-links">
            <button
              disabled={busy || !redirectsReady}
              onClick={() =>
                changeMode(mode === 'signin' ? 'signup' : 'signin')
              }
            >
              {mode === 'signin'
                ? t('Create an account', '创建账号')
                : t('Back to sign in', '返回登录')}
            </button>
            {mode === 'signin' && (
              <button
                disabled={busy || !redirectsReady}
                onClick={() => changeMode('reset')}
              >
                {t('Forgot password?', '忘记密码？')}
              </button>
            )}
          </div>
          <small>
            {t('Shared account terms:', '共用账号条款：')}{' '}
            <a
              href="https://webtomind.com/terms"
              target="_blank"
              rel="noreferrer"
            >
              {t('Terms', '服务条款')}
            </a>{' '}
            ·{' '}
            <a
              href="https://webtomind.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              {t('Privacy', '隐私政策')}
            </a>
          </small>
        </div>
      ) : (
        <>
          <div className="siskill-account-bar">
            <span>{session.user.email}</span>
            <Button variant="ghost" onClick={signout} disabled={busy}>
              {t('Sign out of SiSkill', '退出 SiSkill')}
            </Button>
          </div>
          <MembershipPanel locale={locale} onDownload={download} />
          {offer && !owned && (
            <article className="siskill-auth-card">
              <h2>{offer.name}</h2>
              <p>
                {t('One-time purchase', '单次购买')} · v
                {offer.siskill_releases.version}
              </p>
              {offer.siskill_releases.slug === 'creator-content-workflow' && (
                <p>
                  {t(
                    'Requires your own Codex or Claude Code model access and Node.js 22+. Includes editorial workflows and an offline handoff helper. Image/video rendering and publishing tools are separate; no automatic publishing or growth guarantees. Model and service fees are not included.',
                    '需要自己的 Codex 或 Claude Code 模型服务及 Node.js 22+。包含编辑工作流和离线交接工具；图片／视频渲染与发布工具另配，不含自动发布或涨粉保证。模型和服务费用另计。'
                  )}
                </p>
              )}
              {offer.siskill_releases.slug === 'notebooklm-video' && (
                <p>
                  {t(
                    'Requires your own Google Gemini Notebook account, internet access and available Video Overview quota. Google fees are separate. This Skill prepares the workflow; Google generates the video. Formats and results depend on your account and require review.',
                    '需要自己的 Google Gemini Notebook 账号、网络和可用视频概览额度，Google 费用另计。此 Skill 负责准备工作流，视频由 Google 生成；格式和结果取决于账号，成片需审阅。'
                  )}
                </p>
              )}
              <p>
                {t(
                  'Includes this Skill and its updates while the service operates. No WebToMind credits or SiSkill subscription.',
                  '包含此 Skill 及服务运营期间的更新，不含 WebToMind 积分或 SiSkill 订阅。'
                )}
              </p>
              <p>
                {t(
                  'Commercial finished outputs are allowed; reselling the Skill package is not. For billing or refund requests, contact support. A full refund removes download access.',
                  '可创作商业成品，禁止转售 Skill 原包。账单或退款问题请联系客服，全额退款后将取消下载权限。'
                )}
              </p>
              <p>
                {t(
                  'Stripe payments use the shared WebToMind merchant; your order and access belong to SiSkill.',
                  'Stripe 支付复用 WebToMind 商户，订单和访问权限归属 SiSkill。'
                )}
              </p>
              <div className="siskill-account-actions">
                {providers.includes('stripe') && (
                  <Button
                    disabled={busy || !library}
                    onClick={() => checkout('stripe')}
                  >
                    ${(offer.usd_cents / 100).toFixed(2)} ·{' '}
                    {t('Pay by card', '银行卡支付')}
                  </Button>
                )}
                {providers.includes('alipay') && (
                  <Button
                    disabled={busy || !library}
                    onClick={() => checkout('alipay')}
                  >
                    ¥{(offer.cny_cents / 100).toFixed(2)} ·{' '}
                    {t('Alipay', '支付宝')}
                  </Button>
                )}
              </div>
            </article>
          )}
          <div className="siskill-account-bar">
            <h2>{t('Your library', '我的下载库')}</h2>
            <Button
              variant="secondary"
              onClick={() => setRefresh((v) => v + 1)}
              disabled={busy}
            >
              {t('Refresh', '刷新')}
            </Button>
          </div>
          {libraryError ? (
            <p role="alert">
              {t(
                'We could not load your library. Please refresh.',
                '无法加载下载库，请刷新重试。'
              )}
            </p>
          ) : !library ? (
            <p role="status">{t('Loading purchases…', '正在加载购买记录…')}</p>
          ) : (
            <>
              {requested && (
                <p role="status" className="siskill-feedback">
                  {library.orders.find((o) => o.id === requested)?.status ===
                  'paid'
                    ? t(
                        'Payment confirmed. Your purchased release is listed below.',
                        '支付已确认，所购版本已列在下方。'
                      )
                    : t(
                        'Check your order status below. A return from checkout does not confirm payment.',
                        '请以下方订单状态为准。返回本站不代表支付已确认。'
                      )}
                </p>
              )}
              {!library.grants.length ? (
                <div className="siskill-empty">
                  <h3>
                    {t(
                      'Your next workflow starts here.',
                      '从一个新工作流开始。'
                    )}
                  </h3>
                  <p>
                    {t(
                      'No SiSkill purchases yet. WebToMind membership and credits do not unlock this library.',
                      '暂无 SiSkill 购买记录。WebToMind 会员与积分不会自动解锁此下载库。'
                    )}
                  </p>
                  <ButtonLink to={`/${locale}/skills`}>
                    {t('Explore Skills', '探索 Skill')}
                  </ButtonLink>
                </div>
              ) : (
                <div className="siskill-library">
                  {library.grants.map((g) => (
                    <article key={g.release_id}>
                      <h3>{g.siskill_releases.slug}</h3>
                      <p>v{g.siskill_releases.version}</p>
                      <Button
                        disabled={busy || g.downloadable === false}
                        onClick={() => download(g)}
                      >
                        {t('Download package', '下载安装包')}
                      </Button>
                      {g.downloadable === false && (
                        <p>
                          {t(
                            'Download access is paused while payment is refunded or under dispute. Contact support for help.',
                            '退款或支付争议期间，下载权限已暂停。如需协助，请联系客服。'
                          )}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <h2>{t('Purchase history', '购买记录')}</h2>
              {library.orders.length ? (
                <div className="siskill-orders">
                  {library.orders.map((o) => (
                    <article key={o.id}>
                      <div>
                        <strong>{o.snapshot.name}</strong>
                        <p>
                          v{o.snapshot.version} ·{' '}
                          {new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: o.currency
                          }).format(o.amount / 100)}
                        </p>
                      </div>
                      <span>
                        {labels[o.status] || t('Processing', '处理中')}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="skill-muted">
                  {t(
                    'Your SiSkill orders will appear here.',
                    'SiSkill 订单将在这里显示。'
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
      <p className="skill-muted">
        {t('Need a hand?', '需要帮助？')}{' '}
        <a href="mailto:support@webtomind.com?subject=SiSkill">
          {t('Contact SiSkill support', '联系 SiSkill 支持')}
        </a>{' '}
        ·{' '}
        <Link to={`/${locale}/skills`}>
          {t('Back to Skills', '返回 Skill 目录')}
        </Link>
      </p>
    </section>
  );
}
