import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { client } from './auth-client';
import { Button } from '../../src/shared/ui';
import releases from './free-releases.json';
import { guidePath } from './discovery';
export function FreeSkillDownload({
  slug,
  locale
}: {
  slug: string;
  locale: string;
}) {
  const release = releases.find((r) => r.slug === slug);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle'
  );
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    client()
      .then(async (sdk) => {
        if (!active) return;
        unsubscribe = sdk.auth.onAuthStateChange((_event, session) => {
          if (active) setSignedIn(Boolean(session));
        }).data.subscription.unsubscribe;
        const { data } = await sdk.auth.getSession();
        if (active) setSignedIn(Boolean(data.session));
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const zh = locale === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  if (!release) return null;
  async function download() {
    if (!release || state === 'loading') return;
    setState('loading');
    try {
      const sdk = await client();
      const { data } = await sdk.auth.getSession();
      if (!data.session) {
        navigate(`/${locale}/account?download=${encodeURIComponent(slug)}`);
        setState('idle');
        return;
      }
      const response = await fetch(
        `/api/siskill/free/${release.slug}/${release.version}`,
        {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${data.session.access_token}` }
        }
      );
      if (response.status === 401) {
        setSignedIn(false);
        navigate(`/${locale}/account?download=${encodeURIComponent(slug)}`);
        setState('idle');
        return;
      }
      if (!response.ok) throw Error('Unavailable');
      const bytes = await response.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (bytes.byteLength !== release.bytes || hash !== release.sha256)
        throw Error('Integrity');
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/gzip' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${release.slug}-${release.version}.tar.gz`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState('done');
    } catch {
      setState('error');
    }
  }
  return (
    <div className="siskill-free-download" id="install">
      <Button
        variant="primary"
        onClick={download}
        disabled={state === 'loading'}
      >
        {state === 'loading'
          ? t('Verifying download…', '正在校验下载…')
          : signedIn
            ? t('Download free Skill', '免费下载 Skill')
            : t('Sign in to download', '登录后免费下载')}
      </Button>
      <p className="skill-muted">
        v{release.version} · {Math.ceil(release.bytes / 1024)} KB ·{' '}
        {t(
          'Free with an account · No card needed',
          '注册登录后免费 · 无需信用卡'
        )}
      </p>
      {state === 'done' && (
        <p role="status">
          {t(
            'Package verified. Follow the installation steps below.',
            '安装包已校验，请按下方步骤安装。'
          )}
        </p>
      )}
      {state === 'error' && (
        <p role="alert">
          {t(
            'Download could not be verified. No file was saved. Please retry.',
            '下载未通过校验，未保存文件，请重试。'
          )}
        </p>
      )}
      <p>
        <Link to={`/${locale}${guidePath}`}>
          {t('Installation & troubleshooting guide →', '安装与排错指引 →')}
        </Link>
      </p>
      <p className="skill-muted">
        {t(
          'Commercial finished outputs are allowed under the included license. Do not redistribute the generic Skill. Agent and model costs are separate.',
          '按包内许可可制作商业成品，请勿再分发通用 Skill。Agent 与模型费用另计。'
        )}
      </p>
      <details>
        <summary>{t('Package verification', '安装包校验信息')}</summary>
        <p>SHA-256</p>
        <code className="siskill-package-hash">{release.sha256}</code>
        <p>
          {t(
            'Tested rendering on macOS with Node 24 and Playwright 1.58.2. Other agent behavior and operating systems are not certified.',
            '已在 macOS、Node 24、Playwright 1.58.2 下验证渲染；其他 Agent 行为和操作系统未认证。'
          )}
        </p>
      </details>
    </div>
  );
}
