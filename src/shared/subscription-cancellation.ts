/** Safe billing information returned only to the authenticated owner. */
export interface CancellationSubscription {
  id: string;
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canCancel: boolean;
  prepaid: boolean;
}
