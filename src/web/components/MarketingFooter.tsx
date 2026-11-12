import { AiRechargeLink } from './AiRechargeLink';
import { SupportChat } from './SupportChat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMarketingLocale } from '../lib/marketing-locale';

export function MarketingFooter() {
  const { t } = useTranslation('home');
  const { locale } = useMarketingLocale();
  const promptLibraryTarget =
    locale === 'en-US' ? '/en-US/prompts' : '/zh-CN/prompts';

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-container">
        <div className="marketing-footer-logo">
          <div className="marketing-footer-logo-icon">
            <img
              src="/icons/logo-icon.svg"
              alt="WebToMind"
              width="28"
              height="28"
              loading="lazy"
              decoding="async"
            />
          </div>
          <span className="marketing-footer-logo-text">WebToMind</span>
        </div>

        <div className="marketing-footer-links">
          <Link to={`/${locale}/skills`} className="marketing-footer-link">
            {locale === 'en-US' ? 'Explore Skills' : '发现 Skill'}
          </Link>
          <Link
            to={`/${locale}/skills/pricing`}
            className="marketing-footer-link"
          >
            {locale === 'en-US' ? 'Membership & pricing' : '会员与价格'}
          </Link>
          <Link to="/terms" className="marketing-footer-link">
            {t('footer.terms')}
          </Link>
          <Link to="/privacy" className="marketing-footer-link">
            {t('footer.privacy')}
          </Link>
          <details className="footer-tools">
            <summary>{locale === 'en-US' ? 'More tools' : '更多工具'}</summary>
            <Link to="/create" className="marketing-footer-link">
              {locale === 'en-US' ? 'Image workspace' : '图片创作台'}
            </Link>
            <Link to={promptLibraryTarget} className="marketing-footer-link">
              {locale === 'en-US' ? 'Prompt library' : '提示词资料库'}
            </Link>
            <AiRechargeLink
              placement="footer"
              locale={locale}
              className="marketing-footer-link"
            />
          </details>
          <SupportChat locale={locale} />
          <a
            href="https://x.com/webtomind"
            target="_blank"
            rel="noopener noreferrer"
            className="marketing-footer-link"
          >
            {t('footer.followX')}
          </a>
        </div>

        <div className="marketing-footer-copyright">
          {t('footer.copyright')}
        </div>
      </div>
    </footer>
  );
}
