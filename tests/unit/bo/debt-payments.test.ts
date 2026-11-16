import { describe, expect, it } from 'vitest';
import type { Customer, Supplier } from '../../../src/shared/data/types';
import {
  applyToCustomer,
  applyToSupplier,
  checkPayment,
  distribute,
  formatPaymentNumber,
  nextPaymentSequence,
  sumAllocations,
  type DebtPayment,
  type DebtPaymentDraft,
} from '../../../src/apps/bo/domain/debt-payments';
import type { UnpaidInvoice } from '../../../src/apps/bo/domain/receivable-payable';

const invoice = (number: string, remaining: number, date: string): UnpaidInvoice => ({
  invoiceNumber: number,
  date,
  dueDate: date,
  amount: remaining + 100,
  paid: 100,
  remaining,
  isOverdue: false,
  ageDays: 0,
});

const invoices = [invoice('FJ-1', 1_000, '2026-09-01'), invoice('FJ-2', 3_000, '2026-09-09')];

const draft = (
  allocations: Record<string, number>,
  patch: Partial<DebtPaymentDraft> = {},
): DebtPaymentDraft => ({
  type: 'pelanggan',
  date: '2026-10-19',
  partyId: 'C-1',
  note: '',
  method: 'tunai',
  account: 'Kas Toko',
  allocations,
  ...patch,
});

describe('pembayaran piutang dan hutang', () => {
  it('membagi nominal ke faktur terlama lebih dulu dan membuang sisanya', () => {
    expect(distribute(invoices, 1_500)).toEqual({ 'FJ-1': 1_000, 'FJ-2': 500 });
    expect(distribute(invoices, 10_000)).toEqual({ 'FJ-1': 1_000, 'FJ-2': 3_000 });
    expect(distribute(invoices, 0)).toEqual({ 'FJ-1': 0, 'FJ-2': 0 });
    expect(sumAllocations({ a: 5, b: -3, c: 2 })).toBe(7);
  });

  it('memeriksa pihak, tanggal, nominal, dan alokasi yang melebihi sisa', () => {
    expect(checkPayment(draft({}, { partyId: '' }), invoices)).toEqual({
      ok: false,
      issue: 'pihak',
    });
    expect(checkPayment(draft({}, { date: '' }), invoices)).toEqual({
      ok: false,
      issue: 'tanggal',
    });
    expect(checkPayment(draft({ 'FJ-1': 0 }), invoices)).toEqual({ ok: false, issue: 'nominal' });
    expect(checkPayment(draft({ 'FJ-2': 3_001 }), invoices)).toEqual({
      ok: false,
      issue: 'lebih',
      invoiceNumber: 'FJ-2',
    });
    expect(checkPayment(draft({ 'FJ-1': 1_000, 'FJ-2': 250.4 }), invoices)).toEqual({
      ok: true,
      total: 1_250,
      allocations: [
        { invoiceNumber: 'FJ-1', amount: 1_000 },
        { invoiceNumber: 'FJ-2', amount: 250 },
      ],
    });
  });

  it('menambah paid faktur pelanggan sebesar alokasi dan mencatat riwayat bayarnya', () => {
    const customer = {
      id: 'C-1',
      invoices: [
        { id: 'FJ-1', issuedAt: '2026-09-01', dueAt: '2026-10-01', amount: 1_100, paid: 100 },
        { id: 'FJ-2', issuedAt: '2026-09-09', dueAt: '2026-10-09', amount: 3_100, paid: 100 },
      ],
    } as unknown as Customer;
    const next = applyToCustomer(
      customer,
      [{ invoiceNumber: 'FJ-1', amount: 1_000 }],
      '2026-10-19',
      'edc',
    );
    expect(next.invoices[0]).toMatchObject({
      paid: 1_100,
      payments: [{ method: 'transfer', amount: 1_000 }],
    });
    expect(next.invoices[1]).toBe(customer.invoices[1]);
  });

  it('mengurangi hutang pemasok tanpa menjadi negatif', () => {
    const supplier = { id: 'V-1', payable: 5_000 } as unknown as Supplier;
    expect(applyToSupplier(supplier, 2_000).payable).toBe(3_000);
    expect(applyToSupplier(supplier, 9_000).payable).toBe(0);
  });

  it('menomori pembayaran piutang (PP) dan hutang (PH) secara terpisah', () => {
    const payment = (number: string, type: DebtPayment['type']): DebtPayment => ({
      number,
      type,
      date: '2026-10-19',
      partyId: 'x',
      partyName: 'x',
      method: 'tunai',
      account: 'Kas Toko',
      total: 1,
      note: '',
      userId: 'U-1',
      allocations: [],
    });
    const list = [
      payment('PP-0001', 'pelanggan'),
      payment('PP-0004', 'pelanggan'),
      payment('PH-0002', 'pemasok'),
    ];
    expect(nextPaymentSequence(list, 'pelanggan')).toBe(5);
    expect(nextPaymentSequence(list, 'pemasok')).toBe(3);
    expect(nextPaymentSequence([], 'pemasok')).toBe(1);
    expect(formatPaymentNumber('pelanggan', 7)).toBe('PP-0007');
    expect(formatPaymentNumber('pemasok', 12)).toBe('PH-0012');
  });
});
