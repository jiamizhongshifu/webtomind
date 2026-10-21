import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { client } from './auth-client';
import { Button } from '../../src/shared/ui';
import releases from './free-releases.json';
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
  const [agent, setAgent] = useState('codex');
  const zh = locale === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  if (!release) return null;
  const directory =
    agent === 'codex' ? '.agents/skills/og-image/' : '.claude/skills/og-image/';
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
      <h3>{t('Install in your project', '安装到你的项目')}</h3>
      <label htmlFor="siskill-install-agent">
        {t('Your agent', '选择 Agent')}
      </label>
      <select
        id="siskill-install-agent"
        value={agent}
        onChange={(e) => setAgent(e.target.value)}
      >
        <option value="codex">Codex</option>
        <option value="claude-code">Claude Code</option>
      </select>
      <ol>
        <li>
          {t(
            'Extract the archive and review SKILL.md, LICENSE.md and scripts/render.mjs.',
            '解压安装包，查看 SKILL.md、LICENSE.md 和 scripts/render.mjs。'
          )}
        </li>
        <li>
          {t(
            'Copy the og-image folder to this project path. Back up an existing installation first.',
            '将 og-image 文件夹复制到项目内的下列路径。已有同名安装请先备份。'
          )}{' '}
          <code>{directory}</code>
        </li>
        <li>
          {t(
            'Follow DEPENDENCIES.md to set up Node.js, Playwright and a browser, then open your agent in this project.',
            '按 DEPENDENCIES.md 配置 Node.js、Playwright 和浏览器，然后在该项目中打开 Agent。'
          )}
        </li>
      </ol>
      <h3>{t('Try this brief', '试试这段需求')}</h3>
      <p className="siskill-example-brief">
        {t(
          'Use the og-image Skill to make a 1200 × 630 launch image for the fictional Story kit. Use the grape palette and example.com/demo. Deliver an editable HTML and PNG.',
          '使用 og-image Skill，为虚构的「Story kit」制作 1200 × 630 发布分享图，使用 grape 配色和 example.com/demo，交付可编辑 HTML 和 PNG。'
        )}
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
