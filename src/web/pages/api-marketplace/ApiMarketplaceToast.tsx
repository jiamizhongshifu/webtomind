import { Check, CircleAlert } from 'lucide-react';

export type ApiMarketplaceToastState = {
  message: string;
  tone: 'success' | 'error';
};

export function ApiMarketplaceToast({
  message,
  tone
}: ApiMarketplaceToastState) {
  return (
    <div
      className={`api-marketplace-toast is-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-label={message}
    >
      {tone === 'error' ? (
        <CircleAlert size={16} aria-hidden="true" />
      ) : (
        <Check size={16} aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
}
