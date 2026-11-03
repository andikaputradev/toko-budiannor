import { balanceOf, overdueInvoices, wibDate } from '../../../shared/data/receivable';
import type { DailyRevenue, Product } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import type { AppState } from '../../../shared/store/store';
import { LAST_BACKUP, type BackupInfo } from './backup';
import { countBelowMinimum, countNegative, mostCritical } from './stock-view';

export interface DashboardData {
  readonly omzetToday: number;
  readonly countToday: number;
  readonly overdueAmount: number;
  readonly belowMinimum: number;
  readonly critical: readonly Product[];
  readonly series: readonly DailyRevenue[];
  readonly negative: number;
  readonly queue: number;
  readonly backup: BackupInfo;
}

export const CRITICAL_ROWS = 4;
export const SERIES_DAYS = 7;

export function computeDashboard(state: AppState, now: Date): DashboardData {
  const day = wibDate(now);
  const sales = state.data.sales.filter((sale) => wibDate(new Date(sale.createdAt)) === day);
  const reference = new Date(state.data.referenceDate);
  const overdueAmount = state.data.customers.reduce(
    (sum, customer) =>
      sum +
      overdueInvoices(customer, reference).reduce(
        (inner, invoice) => inner + balanceOf(invoice),
        0,
      ),
    0,
  );
  const products = state.data.products;
  return {
    omzetToday: sales.reduce((sum, sale) => sum + sale.total, 0),
    countToday: sales.length,
    overdueAmount,
    belowMinimum: countBelowMinimum(products),
    critical: mostCritical(products, CRITICAL_ROWS),
    series: state.data.dailyRevenue.slice(-SERIES_DAYS),
    negative: countNegative(products),
    queue: state.posQueue,
    backup: LAST_BACKUP,
  };
}

export function stockLabelValue(product: Product): number {
  return totalStock(product);
}
