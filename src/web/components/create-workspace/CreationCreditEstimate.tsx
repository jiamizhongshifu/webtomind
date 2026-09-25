import './CreationCreditEstimate.css';

export type CreationCreditEstimateUnit = 'image' | 'second' | 'total';

interface CreationCreditEstimateProps {
  credits: number;
  unit: CreationCreditEstimateUnit;
  locale?: 'zh-CN' | 'en-US';
  approximate?: boolean;
  /**
   * 内嵌到生成按钮里时传 true：渲染为纯展示 span（无 role/aria），
   * 积分信息由按钮的 aria-label 承载，避免与按钮可访问名冲突。
   */
  embedded?: boolean;
}

function EstimateSparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.25c.42 2.83 1.92 4.33 4.75 4.75C9.92 6.42 8.42 7.92 8 10.75 7.58 7.92 6.08 6.42 3.25 6 6.08 5.58 7.58 4.08 8 1.25Z"
        fill="currentColor"
      />
      <path
        d="M12.25 9.5c.22 1.48 1.02 2.28 2.5 2.5-1.48.22-2.28 1.02-2.5 2.5-.22-1.48-1.02-2.28-2.5-2.5 1.48-.22 2.28-1.02 2.5-2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CreationCreditEstimate({
  credits,
  unit,
  locale = 'zh-CN',
  approximate = false,
  embedded = false
}: CreationCreditEstimateProps) {
  const normalizedCredits = Number.isFinite(credits)
    ? Math.max(0, Math.ceil(credits))
    : 0;
  const isEnglish = locale === 'en-US';
  const formatted = new Intl.NumberFormat(locale).format(normalizedCredits);

  if (unit === 'total') {
    // 总积分预估：显示本次共消耗多少积分（例如 1 张 100、4 张 400），
    // 随张数/时长/参数实时变化。可访问名统一用"预计本次共消耗 N 积分"。
    const visible = isEnglish
      ? `${formatted} credits`
      : `${formatted} 积分`;
    const accessibleLabel = isEnglish
      ? `Estimated ${normalizedCredits} credits total`
      : `预计本次共消耗 ${normalizedCredits} 积分`;

    return (
      <span
        className={`creation-credit-estimate is-total${
          embedded ? ' is-embedded' : ''
        }`}
        role={embedded ? undefined : 'note'}
        aria-label={embedded ? undefined : accessibleLabel}
        title={accessibleLabel}
      >
        <EstimateSparkleIcon />
        <span>{visible}</span>
      </span>
    );
  }

  const visibleUnit = isEnglish
    ? unit === 'image'
      ? 'image'
      : 'sec'
    : unit === 'image'
      ? '张'
      : '秒';
  const accessibleLabel = isEnglish
    ? `${approximate ? 'Approximately' : 'Estimated'} ${normalizedCredits} credits per ${unit}`
    : `${approximate ? '约' : '预计'}每${visibleUnit}消耗 ${normalizedCredits} 积分`;
  const visiblePrefix = approximate ? (isEnglish ? '~' : '约 ') : '';

  return (
    <span
      className={`creation-credit-estimate${embedded ? ' is-embedded' : ''}`}
      role={embedded ? undefined : 'note'}
      aria-label={embedded ? undefined : accessibleLabel}
      title={accessibleLabel}
    >
      <EstimateSparkleIcon />
      <span>
        {visiblePrefix}
        {formatted}/{visibleUnit}
      </span>
    </span>
  );
}
