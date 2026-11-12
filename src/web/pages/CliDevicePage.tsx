import { type FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, FieldMessage, Input } from '@/shared/ui';
import {
  SkillCatalogRequestError,
  decideDeviceAuthorization,
  describeDeviceAuthorization,
  type DeviceAuthorizationInfo
} from '@/services/skill-catalog-api';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { MarketingPageShell } from './MarketingPageShell';
import '../styles/skill-catalog.css';

type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'pending'; info: DeviceAuthorizationInfo }
  | { status: 'submitting'; info: DeviceAuthorizationInfo; action: 'approve' | 'deny' }
  | { status: 'approved' }
  | { status: 'denied' }
  | { status: 'error'; code: string };

const USER_CODE_PATTERN = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;

function errorMessage(code: string, isZh: boolean): string {
  switch (code) {
    case 'DEVICE_CODE_NOT_FOUND':
      return isZh ? '找不到这个授权码，请确认和终端里显示的一致。' : 'This code was not found. Check it matches your terminal.';
    case 'DEVICE_CODE_EXPIRED':
      return isZh ? '授权码已过期，请在终端重新运行 login。' : 'This code expired. Run login again in your terminal.';
    case 'RATE_LIMITED':
      return isZh ? '尝试次数过多，请稍后再试。' : 'Too many attempts. Please wait and try again.';
    default:
      return isZh ? '暂时无法完成授权，请稍后重试。' : 'Authorization is unavailable right now. Please try again.';
  }
}

export function CliDevicePage() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isAuthenticated, isLoading, getAccessToken } = useAuth();
  const isZh = !pathname.startsWith('/en-US') && !navigator.language.toLowerCase().startsWith('en');
  const userCode = (params.get('user_code') || '').trim().toUpperCase();
  const [draft, setDraft] = useState(userCode);
  const [state, setState] = useState<PageState>({ status: 'idle' });

  useEffect(
    () =>
      applySeo({
        title: isZh ? '授权 WebToMind CLI' : 'Authorize WebToMind CLI',
        description: isZh ? '确认在终端登录 WebToMind CLI。' : 'Confirm signing in to the WebToMind CLI.',
        canonical: `${window.location.origin}/cli/device`,
        robots: 'noindex,nofollow'
      }),
    [isZh]
  );

  useEffect(() => {
    setDraft(userCode);
    if (!USER_CODE_PATTERN.test(userCode)) {
      setState(
        userCode ? { status: 'error', code: 'DEVICE_CODE_NOT_FOUND' } : { status: 'idle' }
      );
      return;
    }
    if (!isAuthenticated) return;
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    setState({ status: 'loading' });
    describeDeviceAuthorization(userCode, token)
      .then((info) => {
        if (!cancelled) setState({ status: 'pending', info });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          code: error instanceof SkillCatalogRequestError ? error.code : 'UNKNOWN'
        });
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated, userCode]);

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    const normalized = draft.trim().toUpperCase();
    if (!USER_CODE_PATTERN.test(normalized)) {
      setState({ status: 'error', code: 'DEVICE_CODE_NOT_FOUND' });
      return;
    }
    setParams({ user_code: normalized }, { replace: true });
  };

  const decide = async (info: DeviceAuthorizationInfo, action: 'approve' | 'deny') => {
    const token = getAccessToken();
    if (!token) return;
    setState({ status: 'submitting', info, action });
    try {
      const result = await decideDeviceAuthorization(info.userCode, action, token);
      setState({ status: result.status === 'approved' ? 'approved' : 'denied' });
    } catch (error) {
      setState({
        status: 'error',
        code: error instanceof SkillCatalogRequestError ? error.code : 'UNKNOWN'
      });
    }
  };

  let content;
  if (isLoading) {
    content = <p className="skill-muted">{isZh ? '正在确认登录状态…' : 'Checking your sign-in…'}</p>;
  } else if (!isAuthenticated) {
    content = (
      <>
        <p>
          {isZh
            ? '登录 WebToMind 后，确认终端里的授权请求。'
            : 'Sign in to WebToMind, then confirm the request from your terminal.'}
        </p>
        <Button
          variant="primary"
          onClick={() => navigate(`/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`)}
        >
          {isZh ? '登录并继续' : 'Sign in to continue'}
        </Button>
      </>
    );
  } else if (state.status === 'approved') {
    content = (
      <div className="skill-device-result" role="status">
        <h2>{isZh ? '已授权，可以回到终端了' : 'Approved. You can return to your terminal.'}</h2>
        <p className="skill-muted">
          {isZh ? 'CLI 会在几秒内完成登录。' : 'The CLI will finish signing in within a few seconds.'}
        </p>
        <ButtonLink to={isZh ? '/zh-CN/skills' : '/en-US/skills'} variant="secondary">
          {isZh ? '去挑一个 Skill' : 'Pick a Skill'}
        </ButtonLink>
      </div>
    );
  } else if (state.status === 'denied') {
    content = (
      <div className="skill-device-result" role="status">
        <h2>{isZh ? '已拒绝这次授权' : 'Request denied'}</h2>
        <p className="skill-muted">
          {isZh ? '终端不会获得任何访问权限。' : 'The terminal did not receive any access.'}
        </p>
      </div>
    );
  } else if (state.status === 'pending' || state.status === 'submitting') {
    const { info } = state;
    content = (
      <>
        <p>
          {isZh
            ? '请确认下面的授权码和终端里显示的一致。批准后，这台设备的 CLI 可以用你的账号下载已解锁的 Skill，不能付款、改设置或访问你的作品。'
            : 'Make sure this code matches your terminal. Approving lets the CLI on that device download Skills your account has unlocked. It cannot pay, change settings or access your work.'}
        </p>
        <div className="skill-device-code" aria-label={isZh ? '授权码' : 'Code'}>
          {info.userCode}
        </div>
        <dl className="skill-device-details">
          <dt>{isZh ? '客户端' : 'Client'}</dt>
          <dd>
            {info.clientName || 'webtomind-cli'}
            {info.clientVersion ? ` ${info.clientVersion}` : ''}
          </dd>
          <dt>{isZh ? '权限' : 'Access'}</dt>
          <dd>{isZh ? '下载 Skill' : 'Download Skills'}</dd>
        </dl>
        <div className="skill-device-actions">
          <Button
            variant="primary"
            isLoading={state.status === 'submitting' && state.action === 'approve'}
            disabled={state.status === 'submitting'}
            onClick={() => decide(info, 'approve')}
          >
            {isZh ? '批准' : 'Approve'}
          </Button>
          <Button
            variant="secondary"
            isLoading={state.status === 'submitting' && state.action === 'deny'}
            disabled={state.status === 'submitting'}
            onClick={() => decide(info, 'deny')}
          >
            {isZh ? '拒绝' : 'Deny'}
          </Button>
        </div>
      </>
    );
  } else if (state.status === 'loading') {
    content = <p className="skill-muted">{isZh ? '正在读取授权请求…' : 'Loading the request…'}</p>;
  } else {
    content = (
      <form className="skill-device-form" onSubmit={submitCode} noValidate>
        <label htmlFor="cli-user-code">
          {isZh ? '输入终端里显示的授权码' : 'Enter the code shown in your terminal'}
        </label>
        <Input
          id="cli-user-code"
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
        />
        {state.status === 'error' ? (
          <FieldMessage tone="error">{errorMessage(state.code, isZh)}</FieldMessage>
        ) : null}
        <Button type="submit" variant="primary">
          {isZh ? '继续' : 'Continue'}
        </Button>
      </form>
    );
  }

  return (
    <MarketingPageShell
      rootClassName="skill-catalog-root"
      title={isZh ? '授权 WebToMind CLI' : 'Authorize WebToMind CLI'}
      subtitle={isZh ? '在终端安装 Skill 前，需要你在这里确认一次。' : 'Confirm once here before installing Skills from your terminal.'}
    >
      <section className="skill-device-card">{content}</section>
    </MarketingPageShell>
  );
}

export default CliDevicePage;
