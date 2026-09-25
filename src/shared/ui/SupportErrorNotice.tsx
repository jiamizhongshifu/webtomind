import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';
import { toUserFacingError } from '../errors/user-facing-error';
import { FeedbackMessage } from './FeedbackMessage';

export interface SupportErrorNoticeProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> {
  message: string;
  locale?: 'zh-CN' | 'en-US';
  title?: string;
  surface?: 'default' | 'web';
}

export function SupportErrorNotice({
  message,
  locale = 'zh-CN',
  title,
  surface = 'web',
  className,
  ...props
}: SupportErrorNoticeProps) {
  const isEnglish = locale === 'en-US';
  const displayMessage = toUserFacingError(
    message,
    isEnglish ? 'The request failed.' : '请求失败。',
    locale
  );

  return (
    <FeedbackMessage
      {...props}
      className={clsx('ui-support-error', className)}
      tone="error"
      surface={surface}
      role="alert"
      aria-live="assertive"
    >
      <strong className="ui-support-error__title">
        {title || (isEnglish ? 'Request failed' : '操作失败')}
      </strong>
      <p className="ui-support-error__reason">
        <span>{isEnglish ? 'Reason: ' : '原因：'}</span>
        {displayMessage}
      </p>
      <div className="ui-support-error__contact">
        <span>
          {isEnglish
            ? 'Still blocked? Contact the administrator:'
            : '仍无法解决？请联系管理员：'}
        </span>
        <span>{isEnglish ? 'WeChat' : '微信'} your-support-id</span>
        <a
          href="https://x.com/your-support-id"
          target="_blank"
          rel="noreferrer noopener"
        >
          X @your-support-id
        </a>
      </div>
    </FeedbackMessage>
  );
}
