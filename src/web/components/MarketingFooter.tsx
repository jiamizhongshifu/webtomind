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
          <Link to="/terms" className="marketing-footer-link">
            {t('footer.terms')}
          </Link>
          <Link to="/privacy" className="marketing-footer-link">
            {t('footer.privacy')}
          </Link>
          <Link to={promptLibraryTarget} className="marketing-footer-link">
            {locale === 'en-US' ? 'AI Image Prompts' : 'Prompt 案例库'}
          </Link>
          <a
            href="mailto:admin@example.com"
            className="marketing-footer-link"
          >
            {t('footer.contact')}
          </a>
          <a
            href="https://x.com/webtomind"
            target="_blank"
            rel="noopener noreferrer"
            className="marketing-footer-link"
          >
            {t('footer.followX')}
          </a>
        </div>

        <div className="marketing-footer-ph">
          <a
            href="https://www.producthunt.com/products/webtomind?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-webtomind"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WebToMind on Product Hunt"
          >
            <img
              alt="WebToMind - AI image prompts + model settings, one-click generate | Product Hunt"
              width="250"
              height="54"
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1218706&theme=dark"
              loading="lazy"
              decoding="async"
            />
          </a>
        </div>

        <div className="marketing-footer-copyright">
          {t('footer.copyright')}
        </div>
      </div>
    </footer>
  );
}
