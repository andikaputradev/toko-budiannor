import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  applyPayment,
  daysBetweenDates,
  overdueRows,
  parseAmount,
  telUrl,
  totalOverdue,
  validatePayment,
  whatsappUrl,
} from '../../../src/apps/owner/domain/receivables';
import { lateCustomer } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('piutang jatuh tempo', () => {
  it('mengurutkan pelanggan dari keterlambatan terlama dan menghitung total', () => {
    const rows = overdueRows(
      [lateCustomer(data, 3, 'C-901'), lateCustomer(data, 12, 'C-902')],
      now,
    );
    expect(rows.map((row) => row.daysLate)).toEqual([12, 3]);
    expect(rows[0]?.customer.id).toBe('C-902');
    expect(totalOverdue(rows)).toBe(2_000_000);
    const all = overdueRows(data.customers, now);
    expect(all.length).toBeGreaterThan(1);
    for (let index = 1; index < all.length; index += 1) {
      expect(all[index - 1]?.daysLate ?? 0).toBeGreaterThanOrEqual(all[index]?.daysLate ?? 0);
    }
  });

  it('mengabaikan invoice lunas atau belum jatuh tempo', () => {
    const base = lateCustomer(data, 5);
    const paid = {
      ...base,
      invoices: base.invoices.map((invoice) => ({ ...invoice, paid: invoice.amount })),
    };
    const future = {
      ...base,
      invoices: base.invoices.map((invoice) => ({ ...invoice, dueAt: '2026-12-31' })),
    };
    expect(overdueRows([paid, future], now)).toEqual([]);
    expect(daysBetweenDates('2026-10-05', '2026-10-17')).toBe(12);
  });

  it('memvalidasi pembayaran dengan MSG-029 dan MSG-087', () => {
    const customer = lateCustomer(data, 5);
    expect(validatePayment(customer, '0')).toMatchObject({ ok: false, messageId: 'MSG-029' });
    expect(validatePayment(customer, 'abc')).toMatchObject({ ok: false, messageId: 'MSG-029' });
    expect(validatePayment(customer, '1.000.001')).toMatchObject({
      ok: false,
      messageId: 'MSG-087',
      values: { saldo: 'Rp 1.000.000' },
    });
    expect(validatePayment(customer, 'Rp 400.000')).toEqual({ ok: true, amount: 400_000 });
    expect(parseAmount('Rp 1.337.000')).toBe(1_337_000);
  });

  it('melunasi invoice tertua lebih dahulu', () => {
    const customer = {
      ...lateCustomer(data, 5),
      invoices: [
        { id: 'B', issuedAt: '2026-09-10', dueAt: '2026-10-10', amount: 500_000, paid: 0 },
        { id: 'A', issuedAt: '2026-09-01', dueAt: '2026-10-01', amount: 300_000, paid: 100_000 },
      ],
    };
    const result = applyPayment(customer, 300_000);
    expect(result.find((item) => item.id === 'A')?.paid).toBe(300_000);
    expect(result.find((item) => item.id === 'B')?.paid).toBe(100_000);
  });

  it('membentuk tautan telepon dan WhatsApp berformat internasional', () => {
    expect(telUrl('0812-3456-7890')).toBe('tel:+6281234567890');
    const url = whatsappUrl('081234567890', 'Halo Toko');
    expect(url).toBe('https://wa.me/6281234567890?text=Halo%20Toko');
  });
});
