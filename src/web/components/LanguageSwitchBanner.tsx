import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/config';

interface LanguageSwitchBannerProps {
  currentLanguage: SupportedLanguage;
  languageNames: Record<SupportedLanguage, string>;
  onContinue: (language: SupportedLanguage) => Promise<void>;
  onDismiss: () => void;
}

export function LanguageSwitchBanner({
  currentLanguage,
  languageNames,
  onContinue,
  onDismiss
}: LanguageSwitchBannerProps) {
  const { t } = useTranslation('home');
  const [selectedLanguage, setSelectedLanguage] =
    useState<SupportedLanguage>(currentLanguage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedLanguage(currentLanguage);
  }, [currentLanguage]);

  async function handleSubmit() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onContinue(selectedLanguage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside
      className="language-switch-banner"
      aria-label={t('languagePrompt.ariaLabel')}
      data-testid="language-switch-banner"
    >
      <div className="language-switch-banner-inner">
        <p className="language-switch-banner-message">
          {t('languagePrompt.message')}
        </p>
        <form
          className="language-switch-banner-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="language-switch-banner-select-wrap">
            <span className="language-switch-banner-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m5 12.5 4.25 4.25L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <label className="sr-only" htmlFor="language-switch-banner-select">
              {t('languagePrompt.selectLabel')}
            </label>
            <select
              id="language-switch-banner-select"
              value={selectedLanguage}
              onChange={(event) => {
                const nextLanguage = event.target.value as SupportedLanguage;
                if (SUPPORTED_LANGUAGES.includes(nextLanguage)) {
                  setSelectedLanguage(nextLanguage);
                }
              }}
              aria-label={t('languagePrompt.selectLabel')}
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {languageNames[language]}
                </option>
              ))}
            </select>
            <svg
              className="language-switch-banner-chevron"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <button
            type="submit"
            className="language-switch-banner-continue"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('languagePrompt.loading')
              : t('languagePrompt.continue')}
          </button>
        </form>
        <button
          type="button"
          className="language-switch-banner-dismiss"
          onClick={onDismiss}
          aria-label={t('languagePrompt.dismiss')}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}
