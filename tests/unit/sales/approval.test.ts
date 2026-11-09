import { describe, expect, it } from 'vitest';
import {
  approvalWarning,
  belowListGap,
  belowListLines,
  belowListText,
} from '../../../src/apps/sales/domain/approval';
import { creditSummary, creditWarning, overdueBanner } from '../../../src/apps/sales/domain/credit';
import { checkReceivable } from '../../../src/shared/data/receivable';
import { generateDataset } from '../../../src/shared/data/generator';
import type { BillLine } from '../../../src/shared/data/types';
import { lateCustomer } from '../owner/support';
import { fixtureProduct } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);
const product = fixtureProduct();
const lookup = (id: string) => (id === product.id ? product : undefined);

const bill = (unitPrice: number, listPrice?: number, quantity = 2): BillLine => ({
  productId: product.id,
  unit: 'Sak',
  quantity,
  unitPrice,
  ...(listPrice === undefined ? {} : { listPrice }),
});

describe('harga di bawah tier', () => {
  it('hanya mengambil baris yang harga ubahnya lebih rendah dari harga tier', () => {
    const rows = belowListLines(
      [bill(54900), bill(50000, 54900), bill(60000, 54900), bill(51000, 54900, 3)],
      lookup,
    );
    expect(rows).toEqual([
      { name: 'Semen Uji', unit: 'Sak', price: 50000, list: 54900, quantity: 2 },
      { name: 'Semen Uji', unit: 'Sak', price: 51000, list: 54900, quantity: 3 },
    ]);
    expect(belowListGap(rows)).toBe(4900 * 2 + 3900 * 3);
  });

  it('menyebut paling banyak tiga barang lalu menghitung sisanya', () => {
    const rows = belowListLines(
      Array.from({ length: 5 }, () => bill(50000, 54900)),
      lookup,
    );
    const text = belowListText(rows);
    expect(text.match(/Semen Uji dijual Rp 50\.000 per Sak/g)).toHaveLength(3);
    expect(text).toContain('Dan 2 barang lain juga di bawah harga tier.');
  });
});

describe('peringatan persetujuan Owner', () => {
  const below = belowListLines([bill(50000, 54900)], lookup);

  it('tidak ada peringatan bila piutang lolos dan tidak ada harga di bawah tier', () => {
    expect(approvalWarning({ decision: { ok: true }, below: [], customer: undefined, now })).toBe(
      undefined,
    );
  });

  it('harga di bawah tier saja meminta persetujuan jenis diskon', () => {
    const warning = approvalWarning({
      decision: { ok: true },
      below,
      customer: undefined,
      now,
    });
    expect(warning).toMatchObject({
      reason: 'below-list',
      reasons: ['below-list'],
      kind: 'diskon',
    });
    expect(warning?.text).toBe(
      'Semen Uji dijual Rp 50.000 per Sak, di bawah harga tier Rp 54.900. Butuh Approval Owner.',
    );
  });

  it('piutang saja tetap memakai teks dan jenis piutang seperti sebelumnya', () => {
    const customer = { ...lateCustomer(data, 12), limit: 900_000_000 };
    const decision = checkReceivable(customer, 5000, now);
    const warning = approvalWarning({ decision, below: [], customer, now });
    expect(warning).toMatchObject({ reason: 'overdue', reasons: ['overdue'], kind: 'piutang' });
    expect(warning?.text).toBe(creditWarning(decision, customer, now)?.text);
  });

  it('gabungan piutang dan harga di bawah tier memuat kedua alasan dengan jenis piutang', () => {
    const customer = { ...lateCustomer(data, 12), limit: 900_000_000 };
    const decision = checkReceivable(customer, 5000, now);
    const warning = approvalWarning({ decision, below, customer, now });
    expect(warning).toMatchObject({
      reason: 'overdue',
      reasons: ['overdue', 'below-list'],
      kind: 'piutang',
    });
    expect(warning?.text).toContain('piutang terlambat');
    expect(warning?.text).toContain('di bawah harga tier Rp 54.900');
  });
});

describe('validasi piutang pada layar Order', () => {
  it('meringkas limit, terpakai, sisa, dan keterlambatan pelanggan', () => {
    const customer = lateCustomer(data, 12);
    expect(creditSummary(customer, now)).toEqual({
      limit: 5_000_000,
      outstanding: 1_000_000,
      remaining: 4_000_000,
      overdue: { amount: 1_000_000, daysLate: 12 },
    });
  });

  it('menyusun teks banner terlambat dan menambah syarat persetujuan untuk penjualan kredit', () => {
    const summary = creditSummary(lateCustomer(data, 12), now);
    expect(overdueBanner(summary, false)).toBe(
      'Pelanggan ini ada piutang terlambat Rp 1.000.000, sudah 12 hari.',
    );
    expect(overdueBanner(summary, true)).toBe(
      'Pelanggan ini ada piutang terlambat Rp 1.000.000, sudah 12 hari. Butuh Approval Owner.',
    );
  });

  it('tidak membuat banner untuk pelanggan tanpa piutang terlambat', () => {
    const customer = { ...lateCustomer(data, 12), invoices: [] };
    const summary = creditSummary(customer, now);
    expect(summary.overdue).toBeUndefined();
    expect(overdueBanner(summary, true)).toBeUndefined();
  });
});
