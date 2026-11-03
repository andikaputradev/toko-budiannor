import { describe, expect, it } from 'vitest';
import type { Customer } from '../../../src/shared/data/types';
import { message } from '../../../src/shared/messages';
import {
  evaluatePayment,
  remainingDue,
  syncReceivableRow,
  withMethodAmount,
  type PaymentRow,
} from '../../../src/apps/pos/domain/payment';

const now = new Date('2026-10-19T03:00:00Z');

function customer(
  limit: number,
  invoices: readonly { dueAt: string; amount: number }[] = [],
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
      paid: 0,
    })),
  };
}

function evaluate(
  total: number,
  rows: readonly PaymentRow[],
  who?: Customer,
  ownerApproved = false,
) {
  return evaluatePayment({ total, rows, customer: who, now, ownerApproved });
}

describe('pembayaran tunai', () => {
  it('siap bila uang pas dan menghitung kembalian bila lebih', () => {
    expect(evaluate(1337000, [{ method: 'tunai', amount: 1337000 }])).toMatchObject({
      status: 'ready',
      change: 0,
    });
    expect(evaluate(1337000, [{ method: 'tunai', amount: 1500000 }])).toMatchObject({
      status: 'ready',
      change: 163000,
    });
  });

  it('menandai kurang bayar dengan pesan MSG-033 dan jumlah kurangnya', () => {
    const result = evaluate(1337000, [{ method: 'tunai', amount: 1217000 }]);
    expect(result.status).toBe('short');
    expect(result.shortfall).toBe(120000);
    expect(result.messageId).toBe('MSG-033');
    expect(message('MSG-033', result.values)).toBe(
      'Pembayaran kurang Rp 120.000. Tambah pembayaran atau pilih Piutang.',
    );
  });

  it('menjumlahkan beberapa cara bayar dalam satu transaksi', () => {
    const rows: PaymentRow[] = [
      { method: 'tunai', amount: 500000 },
      { method: 'qris', amount: 300000 },
      { method: 'transfer', amount: 200000 },
    ];
    expect(evaluate(1000000, rows)).toMatchObject({ status: 'ready', paid: 1000000, change: 0 });
  });

  it('menyatakan kosong bila total nol', () => {
    expect(evaluate(0, [])).toMatchObject({ status: 'empty' });
  });
});

describe('piutang dan DP', () => {
  it('menolak pelanggan Umum dengan MSG-034', () => {
    const result = evaluate(100000, [{ method: 'piutang', amount: 100000 }]);
    expect(result).toMatchObject({ status: 'blocked', messageId: 'MSG-034' });
  });

  it('menolak piutang yang melebihi sisa limit dengan nilai MSG-035', () => {
    const who = customer(1000000, [{ dueAt: '2026-11-01', amount: 500000 }]);
    const result = evaluate(1200000, [{ method: 'piutang', amount: 1200000 }], who);
    expect(result.status).toBe('blocked');
    expect(message(result.messageId ?? 'MSG-035', result.values)).toBe(
      'Transaksi piutang ditolak: jumlah piutang Rp 1.200.000 melebihi sisa limit Rp 500.000.',
    );
  });

  it('menolak piutang bila ada tagihan lewat jatuh tempo (MSG-036)', () => {
    const who = customer(10000000, [{ dueAt: '2026-10-01', amount: 100000 }]);
    expect(evaluate(100000, [{ method: 'piutang', amount: 100000 }], who)).toMatchObject({
      status: 'blocked',
      messageId: 'MSG-036',
    });
  });

  it('menerima piutang yang sah dan menghitung nilainya', () => {
    const who = customer(5000000);
    expect(evaluate(1337000, [{ method: 'piutang', amount: 1337000 }], who)).toMatchObject({
      status: 'ready',
      receivable: 1337000,
    });
  });

  it('memperlakukan DP sebagai uang muka dan sisanya piutang', () => {
    const who = customer(5000000);
    const rows = syncReceivableRow(
      [
        { method: 'dp', amount: 300000 },
        { method: 'piutang', amount: 0 },
      ],
      1000000,
    );
    expect(rows.find((row) => row.method === 'piutang')?.amount).toBe(700000);
    expect(evaluate(1000000, rows, who)).toMatchObject({
      status: 'ready',
      paid: 300000,
      receivable: 700000,
    });
  });

  it('menolak DP untuk pelanggan Umum dan menerima DP yang menutup seluruh tagihan', () => {
    expect(evaluate(1000000, [{ method: 'dp', amount: 300000 }]).messageId).toBe('MSG-034');
    expect(evaluate(1000000, [{ method: 'dp', amount: 1000000 }])).toMatchObject({
      status: 'ready',
    });
  });

  it('meloloskan penolakan limit setelah persetujuan Owner', () => {
    const who = customer(500000);
    const rows: PaymentRow[] = [{ method: 'piutang', amount: 1337000 }];
    expect(evaluate(1337000, rows, who, false).status).toBe('blocked');
    expect(evaluate(1337000, rows, who, true)).toMatchObject({
      status: 'ready',
      receivable: 1337000,
    });
  });
});

describe('baris pembayaran', () => {
  it('mengganti dan menghapus baris per cara bayar', () => {
    let rows: readonly PaymentRow[] = [];
    rows = withMethodAmount(rows, 'tunai', 100000);
    rows = withMethodAmount(rows, 'tunai', 250000);
    expect(rows).toEqual([{ method: 'tunai', amount: 250000 }]);
    expect(withMethodAmount(rows, 'tunai', 0)).toEqual([]);
  });

  it('menghitung sisa tagihan tanpa baris yang sedang diubah', () => {
    const rows: PaymentRow[] = [
      { method: 'tunai', amount: 400000 },
      { method: 'qris', amount: 100000 },
    ];
    expect(remainingDue(1000000, rows)).toBe(500000);
    expect(remainingDue(1000000, rows, 'tunai')).toBe(900000);
  });
});
