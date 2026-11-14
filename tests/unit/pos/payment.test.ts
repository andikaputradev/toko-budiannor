import { describe, expect, it } from 'vitest';
import type { Customer } from '../../../src/shared/data/types';
import { message } from '../../../src/shared/messages';
import {
  cashSuggestions,
  evaluatePayment,
  remainingDue,
  syncReceivableRow,
  withMethodAmount,
  withoutMethod,
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
    expect(remainingDue(1000000, rows, { method: 'tunai' })).toBe(900000);
  });
});

describe('baris pembayaran berkanal', () => {
  it('withMethodAmount menyimpan dua baris Transfer beda kanal dan mengganti baris kanal yang sama', () => {
    let rows: readonly PaymentRow[] = [];
    rows = withMethodAmount(rows, 'transfer', 30000, 'BCA');
    rows = withMethodAmount(rows, 'transfer', 20000, 'BRI');
    expect(rows).toEqual([
      { method: 'transfer', amount: 30000, channel: 'BCA' },
      { method: 'transfer', amount: 20000, channel: 'BRI' },
    ]);
    rows = withMethodAmount(rows, 'transfer', 45000, 'BCA');
    expect(rows).toEqual([
      { method: 'transfer', amount: 20000, channel: 'BRI' },
      { method: 'transfer', amount: 45000, channel: 'BCA' },
    ]);
    expect(withMethodAmount(rows, 'transfer', 0, 'BRI')).toEqual([
      { method: 'transfer', amount: 45000, channel: 'BCA' },
    ]);
  });

  it('withoutMethod dengan kanal hanya membuang baris itu', () => {
    const rows: readonly PaymentRow[] = [
      { method: 'transfer', amount: 30000, channel: 'BCA' },
      { method: 'transfer', amount: 20000, channel: 'BRI' },
    ];
    expect(withoutMethod(rows, 'transfer', 'BCA')).toEqual([
      { method: 'transfer', amount: 20000, channel: 'BRI' },
    ]);
  });

  it('remainingDue menghitung semua baris terbayar kecuali baris yang dilewati menurut rowKey', () => {
    const rows: readonly PaymentRow[] = [
      { method: 'transfer', amount: 30000, channel: 'BCA' },
      { method: 'transfer', amount: 20000, channel: 'BRI' },
    ];
    expect(remainingDue(100000, rows)).toBe(50000);
    expect(remainingDue(100000, rows, { method: 'transfer', channel: 'BRI' })).toBe(70000);
    expect(remainingDue(100000, rows, { method: 'transfer', channel: 'BCA' })).toBe(80000);
  });
});

describe('cashSuggestions (Uang Pas dan dua nominal yang paling mungkin dibayar)', () => {
  it('mengikuti contoh klien pada dokumen Revisi Final POS', () => {
    expect(cashSuggestions(1_556_100)).toEqual([1_560_000, 1_600_000]);
    expect(cashSuggestions(16_000)).toEqual([20_000, 50_000]);
    expect(cashSuggestions(24_000)).toEqual([25_000, 50_000]);
    expect(cashSuggestions(56_000)).toEqual([60_000, 100_000]);
    expect(cashSuggestions(416_000)).toEqual([420_000, 450_000]);
    expect(cashSuggestions(536_000)).toEqual([540_000, 550_000]);
  });

  it('pecahan pertama kelipatan 5.000 berikutnya dan kedua kelipatan 50.000 berikutnya', () => {
    expect(cashSuggestions(1)).toEqual([5000, 50_000]);
    expect(cashSuggestions(3500)).toEqual([5000, 50_000]);
    expect(cashSuggestions(8000)).toEqual([10_000, 50_000]);
    expect(cashSuggestions(141_000)).toEqual([145_000, 150_000]);
    expect(cashSuggestions(111_000)).toEqual([115_000, 150_000]);
    expect(cashSuggestions(1_234_567)).toEqual([1_235_000, 1_250_000]);
  });

  it('melewati nominal yang sama dengan total atau kembar dengan pecahan pertama', () => {
    expect(cashSuggestions(5000)).toEqual([50_000, 100_000]);
    expect(cashSuggestions(20_000)).toEqual([50_000, 100_000]);
    expect(cashSuggestions(49_000)).toEqual([50_000, 100_000]);
    expect(cashSuggestions(50_000)).toEqual([100_000, 150_000]);
    expect(cashSuggestions(70_000)).toEqual([100_000, 150_000]);
    expect(cashSuggestions(100_000)).toEqual([150_000, 200_000]);
    expect(cashSuggestions(110_000)).toEqual([150_000, 200_000]);
  });

  it('selalu memberi dua nominal yang lebih besar dari total dan saling berbeda', () => {
    for (const total of [1, 999, 1500, 9999, 25_000, 48_500, 75_000, 99_000, 101_000, 987_654]) {
      const [first, second] = cashSuggestions(total);
      expect(first, String(total)).toBeGreaterThan(total);
      expect(second, String(total)).toBeGreaterThan(first ?? 0);
    }
  });

  it('tidak memberi saran untuk total nol, negatif, atau bukan angka', () => {
    expect(cashSuggestions(0)).toEqual([]);
    expect(cashSuggestions(-5)).toEqual([]);
    expect(cashSuggestions(Number.NaN)).toEqual([]);
  });
});
