import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { outstanding } from '../../../src/shared/data/receivable';
import {
  applyPayment,
  openInvoicesOf,
  receivableRows,
  totalReceivable,
  totalReceivableOverdue,
  validatePayment,
} from '../../../src/apps/owner/domain/receivables';
import { lateCustomer, need, setup } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('daftar piutang pelanggan', () => {
  it('memuat semua pelanggan berpiutang, terlambat lebih dahulu, dan total sama dengan saldo', () => {
    const rows = receivableRows(data.customers, now);
    expect(rows.length).toBeGreaterThan(20);
    expect(totalReceivable(rows)).toBe(
      data.customers.reduce((sum, customer) => sum + outstanding(customer), 0),
    );
    expect(totalReceivableOverdue(rows)).toBeLessThanOrEqual(totalReceivable(rows));
    for (let index = 1; index < rows.length; index += 1) {
      expect(need(rows[index - 1]).daysLate).toBeGreaterThanOrEqual(need(rows[index]).daysLate);
    }
    const late = need(rows.find((row) => row.daysLate > 0));
    expect(late.overdueAmount).toBeGreaterThan(0);
    const current = rows.find((row) => row.daysLate === 0);
    expect(current?.overdueAmount).toBe(0);
  });

  it('mengurutkan invoice terbuka dari jatuh tempo tertua', () => {
    const customer = need(data.customers.find((item) => item.invoices.length > 1));
    const open = openInvoicesOf(customer);
    for (let index = 1; index < open.length; index += 1) {
      expect(need(open[index - 1]).dueAt <= need(open[index]).dueAt).toBe(true);
    }
  });
});

describe('pembayaran piutang per invoice', () => {
  const customer = {
    ...lateCustomer(data, 5),
    invoices: [
      { id: 'B', issuedAt: '2026-09-10', dueAt: '2026-10-10', amount: 500_000, paid: 0 },
      { id: 'A', issuedAt: '2026-09-01', dueAt: '2026-10-01', amount: 300_000, paid: 100_000 },
    ],
  };

  it('membatasi jumlah bayar pada sisa invoice yang dipilih', () => {
    expect(validatePayment(customer, '500.001', 'B')).toMatchObject({
      ok: false,
      messageId: 'MSG-087',
      values: { saldo: 'Rp 500.000' },
    });
    expect(validatePayment(customer, '500.000', 'B')).toEqual({ ok: true, amount: 500_000 });
    expect(validatePayment(customer, '700.000')).toEqual({ ok: true, amount: 700_000 });
  });

  it('melunasi invoice pilihan lebih dahulu dan mencatat riwayat bayar', () => {
    const result = applyPayment(customer, 600_000, {
      firstId: 'B',
      record: { method: 'qris', at: '2026-10-19' },
    });
    expect(result.find((item) => item.id === 'B')?.paid).toBe(500_000);
    expect(result.find((item) => item.id === 'A')?.paid).toBe(200_000);
    expect(result.find((item) => item.id === 'B')?.payments).toEqual([
      { at: '2026-10-19', amount: 500_000, method: 'qris' },
    ]);
    expect(result.find((item) => item.id === 'A')?.payments).toEqual([
      { at: '2026-10-19', amount: 100_000, method: 'qris' },
    ]);
    expect(applyPayment(customer, 100).every((item) => item.payments === undefined)).toBe(true);
  });

  it('sesi mencatat pembayaran ke invoice pilihan pada riwayatnya', () => {
    const { session, store, dataset } = setup();
    const target = lateCustomer(dataset, 12);
    const two = {
      ...target,
      invoices: [
        ...target.invoices,
        { id: 'INV-901', issuedAt: '2026-09-15', dueAt: '2026-10-25', amount: 400_000, paid: 0 },
      ],
    };
    store.addCustomer(two);
    expect(session.recordPayment(two.id, '450.000', 'tunai', 'INV-901')).toMatchObject({
      messageId: 'MSG-087',
    });
    expect(session.recordPayment(two.id, '400.000', 'qris', 'INV-901')).toEqual({
      ok: true,
      amount: 400_000,
      remaining: 1_000_000,
    });
    const saved = need(store.getState().data.customers.find((item) => item.id === two.id));
    expect(saved.invoices.find((item) => item.id === 'INV-901')?.paid).toBe(400_000);
    expect(saved.invoices.find((item) => item.id === 'INV-900')?.paid).toBe(0);
    expect(saved.invoices.find((item) => item.id === 'INV-901')?.payments?.[0]).toMatchObject({
      amount: 400_000,
      method: 'qris',
    });
  });
});
