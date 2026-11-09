import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOURNAL_ENTRIES,
  DEFAULT_EXPENSE_ITEMS,
  getFilteredJournalEntries,
  calculateJournalTotal,
  calculateExpenseSummary,
  generateCashFlowStatement,
  generateProfitLossStatement,
  generateBalanceSheetStatement,
} from '../../../src/apps/bo/domain/accounting';

describe('Domain Akuntansi & Laporan Keuangan Back Office', () => {
  it('memiliki daftar jurnal otomatis awal dan filter yang tepat', () => {
    expect(DEFAULT_JOURNAL_ENTRIES.length).toBeGreaterThanOrEqual(8);

    const filteredKas = getFilteredJournalEntries(DEFAULT_JOURNAL_ENTRIES, { searchQuery: 'Kas' });
    expect(filteredKas.length).toBeGreaterThan(0);

    const filteredReview = getFilteredJournalEntries(DEFAULT_JOURNAL_ENTRIES, { status: 'review' });
    expect(filteredReview).toHaveLength(1);
    expect(filteredReview[0]?.id).toBe('JU-2610-0311');

    const total = calculateJournalTotal(DEFAULT_JOURNAL_ENTRIES);
    expect(total).toBe(101_173_548);
  });

  it('menghitung ringkasan beban operasional dengan benar', () => {
    const summary = calculateExpenseSummary(DEFAULT_EXPENSE_ITEMS, 412_600_000);
    expect(summary.totalBeban).toBe(52_600_000);
    expect(summary.gajiKomisi).toBe(31_400_000);
    expect(summary.sewaListrik).toBe(12_800_000);
    expect(summary.transportasiLain).toBe(8_400_000);
    expect(summary.persenDariPenjualan).toBe(12.7);
  });

  it('menghasilkan laporan arus kas langsung yang konsisten', () => {
    const cf = generateCashFlowStatement(DEFAULT_EXPENSE_ITEMS);
    expect(cf.initialCash).toBe(195_050_000);
    expect(cf.netOperatingCash).toBe(102_850_000);
    expect(cf.netCashChange).toBe(43_350_000);
    expect(cf.endingCash).toBe(238_400_000);
    expect(cf.initialCash + cf.netCashChange).toBe(cf.endingCash);

    const totalPosisi = cf.cashPositions.reduce((s, p) => s + p.amount, 0);
    expect(totalPosisi).toBe(cf.endingCash);
  });

  it('menghitung laba rugi dengan margin kotor dan laba bersih yang presisi', () => {
    const pl = generateProfitLossStatement(undefined, DEFAULT_EXPENSE_ITEMS);
    expect(pl.revenue.netSales).toBe(412_600_000);
    expect(pl.revenue.cogs).toBe(287_900_000);
    expect(pl.revenue.grossProfit).toBe(124_700_000);
    expect(pl.revenue.grossMarginPercent).toBe(30.2);

    expect(pl.expenses.totalExpense).toBe(52_600_000);
    expect(pl.netProfit).toBe(72_100_000);
    expect(pl.netProfitPercentFromSales).toBe(17.5);
  });

  it('memastikan neraca 100% seimbang (Total Aset === Total Kewajiban dan Ekuitas)', () => {
    const bs = generateBalanceSheetStatement(238_400_000, 72_100_000);
    expect(bs.totalCurrentAssets).toBe(1_609_350_000);
    expect(bs.totalFixedAssets).toBe(185_000_000);
    expect(bs.totalAssets).toBe(1_794_350_000);

    expect(bs.totalLiabilities).toBe(76_350_000);
    expect(bs.totalEquity).toBe(1_718_000_000);
    expect(bs.totalLiabilitiesAndEquity).toBe(1_794_350_000);

    expect(bs.isBalanced).toBe(true);
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity);
  });
});
