import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '@/shared/ui';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import {
  cancelSubscriptionAtPeriodEnd,
  getCancellationSubscriptions,
  SubscriptionCancellationError
} from '@/services/payment-api';
import type { CancellationSubscription } from '@/shared/subscription-cancellation';
import './SubscriptionManagement.css';

export function SubscriptionManagement() {
  const { t } = useTranslation('workspace');
  const { language } = useLanguage();
  const [subscriptions, setSubscriptions] = useState<
    CancellationSubscription[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<CancellationSubscription | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submitting = useRef(false);
  const mounted = useRef(true);
  const date = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(language, {
          dateStyle: 'long',
          timeStyle: 'short'
        }).format(new Date(value))
      : '';
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getCancellationSubscriptions();
      if (mounted.current) setSubscriptions(result.subscriptions);
    } catch {
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const confirm = async () => {
    if (!selected?.currentPeriodEnd || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const result = await cancelSubscriptionAtPeriodEnd(
        selected.id,
        selected.currentPeriodEnd
      );
      if (!mounted.current) return;
      setSubscriptions((current) =>
        current.map((item) =>
          item.id === selected.id ? result.subscription : item
        )
      );
      setSuccess(
        t('membership.cancellation.success', {
          date: date(result.subscription.currentPeriodEnd)
        })
      );
      setSelected(null);
    } catch (caught) {
      if (!mounted.current) return;
      if (
        caught instanceof SubscriptionCancellationError &&
        caught.code === 'BILLING_PERIOD_CHANGED'
      ) {
        setSelected(null);
        setSuccess('');
        await load();
        setError(t('membership.cancellation.periodChanged'));
      } else {
        setError(
          t(
            caught instanceof SubscriptionCancellationError &&
              caught.code === 'AUTH_REQUIRED'
              ? 'membership.cancellation.authError'
              : 'membership.cancellation.cancelError'
          )
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <section
      className="subscription-management"
      aria-label={t('membership.manageSubscription')}
    >
      <h2>{t('membership.manageSubscription')}</h2>
      {loading ? (
        <p role="status">{t('membership.cancellation.loading')}</p>
      ) : loadError ? (
        <div role="alert">
          <p>{t('membership.cancellation.loadError')}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t('membership.cancellation.retry')}
          </Button>
        </div>
      ) : subscriptions.length === 0 ? (
        <p>{t('membership.cancellation.noSubscription')}</p>
      ) : (
        subscriptions.map((item) => (
          <div className="subscription-management__row" key={item.id}>
            <div>
              <h3>{item.planName.toUpperCase()}</h3>
              <p>
                {t(
                  item.prepaid
                    ? 'membership.cancellation.prepaid'
                    : item.cancelAtPeriodEnd
                      ? 'membership.cancellation.scheduled'
                      : 'membership.cancellation.renews',
                  { date: date(item.currentPeriodEnd) }
                )}
              </p>
              {!item.prepaid && !item.cancelAtPeriodEnd && !item.canCancel && (
                <p>{t('membership.cancellation.unavailable')}</p>
              )}
            </div>
            {item.canCancel && (
              <Button
                variant="outline"
                onClick={() => {
                  setError('');
                  setSuccess('');
                  setSelected(item);
                }}
              >
                {t('membership.cancellation.cancel')}
              </Button>
            )}
          </div>
        ))
      )}
      {success && <p role="status">{success}</p>}
      {error && !selected && <p role="alert">{error}</p>}
      <Dialog
        className="subscription-cancellation-dialog"
        open={Boolean(selected)}
        title={t('membership.cancellation.title')}
        closeLabel={t('membership.cancellation.keep')}
        description={t('membership.cancellation.description', {
          date: date(selected?.currentPeriodEnd || null)
        })}
        onClose={() => {
          if (!submitting.current) {
            setSelected(null);
            setError('');
          }
        }}
        closeDisabled={pending}
        footer={
          <>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setSelected(null)}
            >
              {t('membership.cancellation.keep')}
            </Button>
            <Button disabled={pending} onClick={() => void confirm()}>
              {t(
                pending
                  ? 'membership.cancellation.submitting'
                  : 'membership.cancellation.confirm'
              )}
            </Button>
          </>
        }
      >
        <p>{t('membership.cancellation.noRefund')}</p>
        {error && <p role="alert">{error}</p>}
      </Dialog>
    </section>
  );
}
