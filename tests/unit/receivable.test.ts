import { describe, expect, it } from 'vitest';
import {
  checkReceivable,
  outstanding,
  overdueInvoices,
  receivableAmount,
  remainingLimit,
  wibDate,
} from '../../src/shared/data/receivable';
import type { Customer } from '../../src/shared/data/types';
import { message } from '../../src/shared/messages';

const now = new Date('2026-10-19T03:00:00Z');

function customer(
  limit: number,
  invoices: readonly { dueAt: string; amount: number; paid?: number }[],
): Customer {
  return {
    id: 'C-900',
    code: 'C0900',
    name: 'Pelanggan Uji',
    phone: '081200000000',
    tier: 'grosir',
    limit,
    invoices: invoices.map((invoice, index) => ({
      id: `INV-${String(index)}`,
      issuedAt: '2026-09-01',
      dueAt: invoice.dueAt,
      amount: invoice.amount,
      paid: invoice.paid ?? 0,
    })),
  };
}

describe('kelayakan piutang', () => {
  it('menghitung saldo piutang dan sisa limit', () => {
    const subject = customer(1000000, [
      { dueAt: '2026-11-01', amount: 400000, paid: 100000 },
      { dueAt: '2026-11-05', amount: 200000 },
    ]);
    expect(outstanding(subject)).toBe(500000);
    expect(remainingLimit(subject)).toBe(500000);
  });

  it('mengizinkan piutang yang tidak melebihi sisa limit tanpa tagihan lewat jatuh tempo', () => {
    const subject = customer(2000000, [{ dueAt: '2026-11-01', amount: 500000 }]);
    expect(checkReceivable(subject, 1500000, now)).toEqual({ ok: true });
  });

  it('menolak piutang yang melebihi sisa limit dengan nilai pesan MSG-035', () => {
    const subject = customer(1000000, [{ dueAt: '2026-11-01', amount: 500000 }]);
    const decision = checkReceivable(subject, 1200000, now);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toBe('over-limit');
      expect(decision.messageId).toBe('MSG-035');
      expect(message(decision.messageId, decision.values)).toBe(
        'Transaksi piutang ditolak: jumlah piutang Rp 1.200.000 melebihi sisa limit Rp 500.000.',
      );
    }
  });

  it('menolak piutang bila ada tagihan melewati jatuh tempo walau limit cukup', () => {
    const subject = customer(10000000, [{ dueAt: '2026-10-10', amount: 100000 }]);
    const decision = checkReceivable(subject, 100000, now);
    expect(decision).toMatchObject({ ok: false, reason: 'overdue', messageId: 'MSG-036' });
    expect(overdueInvoices(subject, now)).toHaveLength(1);
  });

  it('tidak menganggap tagihan lunas atau jatuh tempo hari ini sebagai terlambat', () => {
    const settled = customer(5000000, [{ dueAt: '2026-10-01', amount: 100000, paid: 100000 }]);
    const today = customer(5000000, [{ dueAt: wibDate(now), amount: 100000 }]);
    expect(checkReceivable(settled, 100000, now).ok).toBe(true);
    expect(checkReceivable(today, 100000, now).ok).toBe(true);
  });

  it('menolak pelanggan yang tidak terdaftar dengan MSG-034', () => {
    expect(checkReceivable(undefined, 1000, now)).toMatchObject({
      ok: false,
      reason: 'unregistered',
      messageId: 'MSG-034',
    });
  });

  it('menerima jumlah tepat sama dengan sisa limit dan menolak satu rupiah di atasnya', () => {
    const subject = customer(1000000, [{ dueAt: '2026-11-01', amount: 600000 }]);
    expect(checkReceivable(subject, 400000, now).ok).toBe(true);
    expect(checkReceivable(subject, 400001, now).ok).toBe(false);
  });

  it('melaporkan sisa limit nol bila saldo sudah melewati limit', () => {
    const subject = customer(500000, [{ dueAt: '2026-11-01', amount: 800000 }]);
    const decision = checkReceivable(subject, 1000, now);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.values['sisaLimit']).toBe('Rp 0');
    }
  });

  it('menghitung sisa piutang setelah DP', () => {
    expect(receivableAmount(1000000, 300000)).toBe(700000);
    expect(receivableAmount(1000000, 1500000)).toBe(0);
    expect(receivableAmount(1000000, -5)).toBe(1000000);
  });
});
