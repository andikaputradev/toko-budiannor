import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { wibDate } from '../../../src/shared/data/receivable';
import { percentChange, summarize, TRADING_HOURS } from '../../../src/apps/owner/domain/summary';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('ringkasan omzet', () => {
  it('menghitung persen perubahan dan menolak pembanding nol', () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(95, 100)).toBe(-5);
    expect(percentChange(10, 0)).toBeUndefined();
  });

  it('memberi 10 batang jam 08 sampai 17 dan menjumlahkan transaksi hari ini', () => {
    const summary = summarize(data, now, 'hari-ini');
    expect(summary.bars.map((bar) => bar.key)).toEqual(
      TRADING_HOURS.map((hour) => String(hour).padStart(2, '0')),
    );
    const today = wibDate(now);
    const sales = data.sales.filter((sale) => wibDate(new Date(sale.createdAt)) === today);
    expect(summary.count).toBe(sales.length);
    expect(summary.revenue).toBe(sales.reduce((sum, sale) => sum + sale.total, 0));
    expect(summary.bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(summary.revenue);
    expect(summary.average).toBe(Math.round(summary.revenue / summary.count));
  });

  it('membandingkan hari ini dengan kemarin sampai jam yang sama', () => {
    const summary = summarize(data, now, 'hari-ini');
    const yesterday = summarize(data, now, 'kemarin');
    expect(yesterday.revenue).toBeGreaterThan(summary.revenue);
    expect(summary.comparison).not.toBeUndefined();
    expect(yesterday.comparison).not.toBeUndefined();
    expect(yesterday.bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(yesterday.revenue);
  });

  it('memakai omzet harian untuk 7 hari dengan 7 batang dan pembanding 7 hari sebelumnya', () => {
    const summary = summarize(data, now, '7-hari');
    expect(summary.bars).toHaveLength(7);
    expect(summary.revenue).toBe(summary.bars.reduce((sum, bar) => sum + bar.value, 0));
    expect(summary.comparison).not.toBeUndefined();
  });

  it('menghasilkan nol tanpa transaksi', () => {
    const empty = { ...data, sales: [], dailyRevenue: [] };
    const summary = summarize(empty, now, 'hari-ini');
    expect(summary).toMatchObject({ revenue: 0, count: 0, average: 0, comparison: undefined });
    expect(summarize(empty, now, '7-hari').comparison).toBeUndefined();
  });
});
