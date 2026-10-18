export const FREE_SPLIT_LIMIT = 6;
export const SANDBOX_AMOUNT_PAISE = 7500;
export type BillingStatus = {
  configured: boolean; enforced: boolean; mode: 'test' | 'live'; amountPaise: number; currency: 'INR';
  premium: boolean; paidUntil: number | null; subscriptionId: string | null; status: string;
  cancellationScheduled: boolean; splitLimit: number | null; testAccessDurationSeconds?: number | null;
  accessSource?: 'manual' | 'subscription' | null;
};
