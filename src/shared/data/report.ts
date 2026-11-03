import type { Dataset } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_REPORT_DAYS = 366;

export interface ProfitLoss {
  readonly sales: number;
  readonly cogs: number;
  readonly gross: number;
  readonly expenses: number;
  readonly net: number;
}

export interface ExpenseRow {
  readonly category: string;
  readonly amount: number;
}

export interface ExpenseSummary {
  readonly rows: readonly ExpenseRow[];
  readonly total: number;
}

export function rangeDays(start: string, end: string): number {
  return (
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
  );
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function costRatio(data: Dataset): number {
  const products = new Map(data.products.map((product) => [product.id, product]));
  let revenue = 0;
  let cost = 0;
  for (const sale of data.sales) {
    revenue += sale.total;
    for (const line of sale.lines) {
      const product = products.get(line.productId);
      const factor = product?.units.find((unit) => unit.code === line.unit)?.factor ?? 1;
      cost += line.quantity * (product?.hpp ?? 0) * factor;
    }
  }
  if (revenue <= 0) {
    return 0.78;
  }
  return Math.min(0.95, Math.max(0.5, cost / revenue));
}

export function expenseSummary(data: Dataset, start: string, end: string): ExpenseSummary {
  const totals = new Map<string, number>();
  for (const expense of data.expenses) {
    if (inRange(expense.date, start, end)) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
  }
  const rows = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort(
      (first, second) =>
        second.amount - first.amount || first.category.localeCompare(second.category),
    );
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

export function profitLoss(data: Dataset, start: string, end: string): ProfitLoss {
  const sales = data.dailyRevenue
    .filter((item) => inRange(item.date, start, end))
    .reduce((sum, item) => sum + item.revenue, 0);
  const cogs = Math.round(sales * costRatio(data));
  const expenses = expenseSummary(data, start, end).total;
  const gross = sales - cogs;
  return { sales, cogs, gross, expenses, net: gross - expenses };
}
