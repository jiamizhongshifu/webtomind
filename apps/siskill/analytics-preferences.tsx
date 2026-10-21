import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  consentKey,
  readConsent,
  setConsent,
  startAnalytics,
  trackPage
} from './analytics';

export function AnalyticsPreferences({ locale }: { locale: string }) {
  const location = useLocation();
  const [open, setOpen] = useState(() => readConsent() === null);
  const [saved, setSaved] = useState(true);
  const zh = locale === 'zh-CN';
  useEffect(() => {
    startAnalytics();
    trackPage();
  }, [location.pathname]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === consentKey || event.key === null)
        window.location.reload();
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  function choose(value: 'granted' | 'denied') {
    const ok = setConsent(value);
    setSaved(ok);
    if (ok) setOpen(false);
  }
  return (
    <>
      <button className="siskill-privacy-link" onClick={() => setOpen(true)}>
        {zh ? '统计偏好' : 'Analytics preferences'}
      </button>
      {open && (
        <section
          className="siskill-consent"
          aria-label={zh ? '网站统计偏好' : 'Website analytics preferences'}
        >
          <div>
            <strong>
              {zh ? '帮助我们改进 SiSkill' : 'Help us improve SiSkill'}
            </strong>
            <p>
              {zh
                ? '允许 Google Analytics 使用可选 Cookie，统计页面浏览和工作流使用情况。拒绝也可正常购买和下载。可随时在页脚更改。'
                : 'Allow optional Google Analytics cookies to measure visits and workflow usage. You can buy and download without them, and change your choice in the footer.'}
            </p>
            <details>
              <summary>{zh ? '采集哪些信息？' : 'What is collected?'}</summary>
              <p>
                {zh
                  ? '仅采集已知页面、Skill、登录方式、已创建结账和校验成功的下载事件。不会发送邮箱、密码、搜索原文或账号回调参数；不会用于广告个性化。数据由 Google 处理，统计仅覆盖同意的访问。'
                  : 'We send known pages, Skills, login method, created checkouts and verified downloads. We exclude email, passwords, search text and account callback parameters. Google processes this data; advertising personalization is disabled. Reports cover consenting visits only.'}
              </p>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
              >
                {zh ? 'Google 隐私政策' : 'Google privacy policy'} ↗
              </a>
            </details>
            {!saved && (
              <p role="status">
                {zh
                  ? '浏览器无法保存偏好，统计仍保持关闭。'
                  : 'Your browser could not save this choice. Analytics remains off.'}
              </p>
            )}
          </div>
          <div className="siskill-consent-actions">
            <button onClick={() => choose('denied')}>
              {zh ? '拒绝可选统计' : 'Decline analytics'}
            </button>
            <button onClick={() => choose('granted')}>
              {zh ? '允许统计' : 'Allow analytics'}
            </button>
            {readConsent() !== null && (
              <button onClick={() => setOpen(false)}>
                {zh ? '关闭' : 'Close'}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
