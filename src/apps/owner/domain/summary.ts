import { wibDate } from '../../../shared/data/receivable';
import type { Dataset } from '../../../shared/data/types';

export type Period = 'hari-ini' | 'kemarin' | '7-hari';

export interface Bar {
  readonly key: string;
  readonly value: number;
}

export interface PeriodSummary {
  readonly revenue: number;
  readonly count: number;
  readonly average: number;
  readonly comparison: number | undefined;
  readonly bars: readonly Bar[];
}

export const TRADING_HOURS: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function wibMinutes(date: Date): number {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function shiftDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

export function percentChange(current: number, previous: number): number | undefined {
  if (previous <= 0) {
    return undefined;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function salesOn(data: Dataset, day: string): Dataset['sales'] {
  return data.sales.filter((sale) => wibDate(new Date(sale.createdAt)) === day);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function hourlyBars(sales: Dataset['sales']): Bar[] {
  return TRADING_HOURS.map((hour) => ({
    key: String(hour).padStart(2, '0'),
    value: sum(
      sales
        .filter((sale) => Math.floor(wibMinutes(new Date(sale.createdAt)) / 60) === hour)
        .map((sale) => sale.total),
    ),
  }));
}

function finish(
  revenue: number,
  count: number,
  comparison: number | undefined,
  bars: readonly Bar[],
): PeriodSummary {
  return {
    revenue,
    count,
    average: count === 0 ? 0 : Math.round(revenue / count),
    comparison,
    bars,
  };
}

export function summarize(data: Dataset, now: Date, period: Period): PeriodSummary {
  const today = wibDate(now);
  if (period === 'hari-ini') {
    const sales = salesOn(data, today);
    const cutoff = wibMinutes(now);
    const earlier = salesOn(data, shiftDay(today, -1)).filter(
      (sale) => wibMinutes(new Date(sale.createdAt)) <= cutoff,
    );
    const revenue = sum(sales.map((sale) => sale.total));
    return finish(
      revenue,
      sales.length,
      percentChange(revenue, sum(earlier.map((sale) => sale.total))),
      hourlyBars(sales),
    );
  }
  if (period === 'kemarin') {
    const day = shiftDay(today, -1);
    const sales = salesOn(data, day);
    const before = data.dailyRevenue.find((item) => item.date === shiftDay(day, -1));
    const revenue = sum(sales.map((sale) => sale.total));
    return finish(
      revenue,
      sales.length,
      before === undefined ? undefined : percentChange(revenue, before.revenue),
      hourlyBars(sales),
    );
  }
  const series = data.dailyRevenue.filter((item) => item.date <= today);
  const last = series.slice(-7);
  const previous = series.slice(-14, -7);
  const revenue = sum(last.map((item) => item.revenue));
  return finish(
    revenue,
    sum(last.map((item) => item.count)),
    previous.length < 7
      ? undefined
      : percentChange(revenue, sum(previous.map((item) => item.revenue))),
    last.map((item) => ({ key: item.date, value: item.revenue })),
  );
}
