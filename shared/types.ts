export type EntryKind = 'income' | 'expense';
export type EntryStatus = 'planned' | 'done' | 'cancelled';

export interface Entry {
  id: string;
  kind: EntryKind;
  description: string;
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  categoryId?: string | null;
  categoryName?: string | null;
  incomeSourceId?: string | null;
  incomeSourceName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  status: EntryStatus;
  settledCents: number;
  recurringRuleId?: string | null;
  cardPurchaseId?: string | null;
  cardInstallmentId?: string | null;
  paymentMethod?: string | null;
  version: number;
}

export interface DashboardSummary {
  availableNowCents: number;
  reservedCents: number;
  incomeReceivedCents: number;
  incomeScheduledCents: number;
  incomeExpectedCents: number;
  incomeMissingCents: number;
  expensesPaidCents: number;
  expensesRemainingCents: number;
  monthEndTargetCents: number;
  projectedFreeCents: number;
  additionalIncomeNeededCents: number;
  firstCashRisk: null | { date: string; deficitCents: number; after: string };
}

export interface AccountSummary {
  id: string;
  name: string;
  type?: string;
  balanceCents: number;
  reservedCents: number;
  freeCents: number;
}

export interface RecurringRule {
  id: string;
  kind: EntryKind;
  description: string;
  amountCents: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  nature: 'fixed' | 'estimated';
  startDate: string;
  endDate?: string | null;
  active: boolean;
  categoryName?: string | null;
  incomeSourceName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  paymentMethod?: string | null;
  version?: number;
}

export interface ApiError { error: string; code?: string; siteKey?: string }
