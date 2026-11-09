import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { linesTotal } from '../../../src/shared/data/invoice-lines';
import { createStore } from '../../../src/shared/store/store';
import {
  applyPayablePayment,
  openInvoiceCount,
  openPayables,
  payableRows,
  remainingOf,
  supplierBalance,
  totalPayable,
  validatePayablePayment,
} from '../../../src/apps/owner/domain/payables';
import { need, setup } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('faktur hutang supplier pada generator', () => {
  it('membuat faktur deterministik dengan sisa sama dengan payable supplier', () => {
    expect(JSON.stringify(generateDataset().suppliers)).toBe(JSON.stringify(data.suppliers));
    for (const supplier of data.suppliers) {
      expect(supplier.invoices?.length ?? 0).toBeGreaterThan(0);
      expect(supplierBalance(supplier)).toBe(supplier.payable);
    }
    expect(data.suppliers.map((item) => item.payable === 0)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it('memberi 2 sampai 4 baris barang yang jumlahnya tepat sama dengan nilai faktur', () => {
    const catalog = new Map(data.products.map((product) => [product.id, product]));
    for (const supplier of data.suppliers) {
      for (const invoice of supplier.invoices ?? []) {
        expect(invoice.lines.length).toBeGreaterThanOrEqual(2);
        expect(invoice.lines.length).toBeLessThanOrEqual(4);
        expect(linesTotal(invoice.lines)).toBe(invoice.amount);
        expect(invoice.paid).toBeLessThanOrEqual(invoice.amount);
        expect(invoice.dueAt > invoice.issuedAt).toBe(true);
        for (const line of invoice.lines) {
          const product = catalog.get(line.productId);
          expect(product?.units.some((unit) => unit.code === line.unit)).toBe(true);
          expect(line.quantity).toBeGreaterThan(0);
        }
      }
    }
  });

  it('menyisakan supplier tanpa hutang dengan faktur lunas sebagai riwayat', () => {
    const clean = need(data.suppliers[1]);
    expect(clean.payable).toBe(0);
    expect(openPayables(clean)).toEqual([]);
    expect(need(clean.invoices?.[0]).paid).toBe(need(clean.invoices?.[0]).amount);
  });
});

describe('domain hutang', () => {
  it('mengurutkan supplier berhutang dari yang terlambat dan menghitung total', () => {
    const rows = payableRows(data.suppliers, now);
    expect(rows.every((row) => row.balance > 0)).toBe(true);
    for (let index = 1; index < rows.length; index += 1) {
      expect(need(rows[index - 1]).daysLate).toBeGreaterThanOrEqual(need(rows[index]).daysLate);
    }
    expect(totalPayable(rows)).toBe(data.suppliers.reduce((sum, item) => sum + item.payable, 0));
    expect(openInvoiceCount(rows)).toBe(
      data.suppliers.reduce((sum, item) => sum + openPayables(item).length, 0),
    );
  });

  it('memvalidasi pembayaran: nol ditolak MSG-029, melebihi saldo ditolak', () => {
    const supplier = need(data.suppliers[0]);
    expect(validatePayablePayment(supplier, '0')).toMatchObject({
      ok: false,
      messageId: 'MSG-029',
    });
    const over = validatePayablePayment(supplier, String(supplier.payable + 1));
    expect(over).toMatchObject({ ok: false, labelKey: 'htgMelebihiSaldo' });
    expect(validatePayablePayment(supplier, 'Rp 1.000')).toEqual({ ok: true, amount: 1000 });
    const first = need(openPayables(supplier)[0]);
    const limited = validatePayablePayment(supplier, String(remainingOf(first) + 1), first.id);
    expect(limited).toMatchObject({ ok: false, labelKey: 'htgMelebihiSaldo' });
  });

  it('melunasi faktur tertua lebih dahulu, atau faktur pilihan lebih dahulu', () => {
    const supplier = {
      ...need(data.suppliers[0]),
      invoices: [
        {
          id: 'B',
          issuedAt: '2026-09-10',
          dueAt: '2026-10-10',
          amount: 500_000,
          paid: 0,
          lines: [],
        },
        {
          id: 'A',
          issuedAt: '2026-09-01',
          dueAt: '2026-10-01',
          amount: 300_000,
          paid: 100_000,
          lines: [],
        },
      ],
      payable: 700_000,
    };
    const oldest = applyPayablePayment(supplier, 300_000);
    expect(oldest.invoices?.find((item) => item.id === 'A')?.paid).toBe(300_000);
    expect(oldest.invoices?.find((item) => item.id === 'B')?.paid).toBe(100_000);
    expect(oldest.payable).toBe(400_000);
    const chosen = applyPayablePayment(supplier, 300_000, {
      firstId: 'B',
      record: { method: 'transfer', at: '2026-10-19' },
    });
    expect(chosen.invoices?.find((item) => item.id === 'B')?.paid).toBe(300_000);
    expect(chosen.invoices?.find((item) => item.id === 'B')?.payments).toEqual([
      { at: '2026-10-19', amount: 300_000, method: 'transfer' },
    ]);
    expect(chosen.invoices?.find((item) => item.id === 'A')?.paid).toBe(100_000);
  });
});

describe('store.saveSupplier dan session.payPayable', () => {
  it('mengganti data supplier dan mengembalikannya saat data diatur ulang', () => {
    const store = createStore({ dataset: data });
    const supplier = need(store.getState().data.suppliers[0]);
    store.saveSupplier({ ...supplier, payable: 1 });
    expect(store.getState().data.suppliers[0]?.payable).toBe(1);
    expect(store.getState().data.suppliers[1]).toBe(data.suppliers[1]);
    store.resetData();
    expect(store.getState().data.suppliers[0]?.payable).toBe(supplier.payable);
  });

  it('mencatat pembayaran hutang: faktur tertua berkurang, log aktivitas tertulis', () => {
    const { session, store } = setup();
    const supplier = need(store.getState().data.suppliers[0]);
    const before = supplierBalance(supplier);
    expect(session.payPayable(supplier.id, '0', 'tunai')).toMatchObject({ messageId: 'MSG-029' });
    expect(session.payPayable(supplier.id, String(before + 1), 'tunai')).toMatchObject({
      labelKey: 'htgMelebihiSaldo',
    });
    const result = session.payPayable(supplier.id, '500.000', 'transfer');
    expect(result).toEqual({ ok: true, amount: 500_000, remaining: before - 500_000 });
    const saved = need(store.getState().data.suppliers.find((item) => item.id === supplier.id));
    expect(saved.payable).toBe(before - 500_000);
    expect(supplierBalance(saved)).toBe(saved.payable);
    expect(store.getState().activity.at(-1)?.detail).toContain('Pembayaran hutang');
    expect(session.payPayable('V-999', '1', 'tunai')).toMatchObject({ messageId: 'MSG-118' });
  });

  it('mengantrekan pembayaran hutang saat offline', () => {
    const { session, store } = setup({ online: false });
    const supplier = need(store.getState().data.suppliers[0]);
    expect(session.payPayable(supplier.id, '1000', 'tunai')).toMatchObject({ ok: true });
    expect(session.state().queue.at(-1)?.text).toContain('Pembayaran hutang');
  });
});
