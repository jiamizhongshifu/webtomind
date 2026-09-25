interface StaleAssetRecoveryNoticeProps {
  locale: 'zh-CN' | 'en-US';
}

export function StaleAssetRecoveryNotice({
  locale
}: StaleAssetRecoveryNoticeProps) {
  const isEnglish = locale === 'en-US';

  return (
    <main
      className="web-app-stale-recovery"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="web-app-stale-recovery__panel">
        <span
          className="web-app-stale-recovery__spinner"
          aria-hidden="true"
        />
        <strong>
          {isEnglish ? 'Updating WebToMind' : '正在更新 WebToMind'}
        </strong>
        <p>
          {isEnglish
            ? 'A new version is ready. The page will continue automatically.'
            : '新版本已就绪，页面将自动继续。'}
        </p>
      </div>
    </main>
  );
}
