import { describe, expect, it } from 'vitest';
import {
  buildReceipt,
  PAPER_CHARS,
  wrapText,
  type PaperWidth,
  type ReceiptInput,
} from '../../../src/apps/pos/domain/receipt';

function input(kind: ReceiptInput['kind'], width: PaperWidth): ReceiptInput {
  return {
    kind,
    width,
    number: kind === 'draft' ? 'B-0003' : 'T-000103',
    at: new Date('2026-10-19T03:00:00Z'),
    cashier: 'Dewi',
    customer: 'UD Maju Jaya Konstruksi Sejahtera Abadi',
    items: [
      {
        name: 'Semen PCC Karya Mandiri Super Ekonomis Premium Kualitas Tinggi',
        quantity: 1.5,
        unit: 'Sak',
        unitPrice: 445667,
        subtotal: 668500,
      },
      { name: 'Paku 2 inci', quantity: 10, unit: 'Kg', unitPrice: 15200, subtotal: 152000 },
    ],
    total: 820500,
    payments: [{ method: 'Tunai', amount: 900000 }],
    change: 79500,
  };
}

describe('struk 58 mm dan 80 mm', () => {
  it('memakai 32 dan 48 karakter per baris', () => {
    expect(PAPER_CHARS[58]).toBe(32);
    expect(PAPER_CHARS[80]).toBe(48);
  });

  for (const width of [58, 80] as const) {
    for (const kind of ['draft', 'sale', 'copy'] as const) {
      it(`tidak melebihi lebar kertas untuk ${kind} ${String(width)} mm`, () => {
        const lines = buildReceipt(input(kind, width));
        for (const line of lines) {
          expect(line.length).toBeLessThanOrEqual(PAPER_CHARS[width]);
        }
      });
    }
  }

  it('menulis judul struk draf persis dan tanpa harga atau harga modal', () => {
    for (const width of [58, 80] as const) {
      const text = buildReceipt(input('draft', width)).join('\n');
      expect(text).toContain('STRUK DRAF, BUKAN BUKTI BAYAR');
      expect(text).toContain('B-0003');
      expect(text).not.toContain('Rp');
      expect(text).toContain('1,5 Sak');
    }
  });

  it('menandai salinan dan memuat total, pembayaran, dan kembalian pada struk penjualan', () => {
    const copy = buildReceipt(input('copy', 58)).join('\n');
    expect(copy).toContain('SALINAN');
    expect(copy).toContain('Rp 820.500');
    expect(copy).toContain('Rp 900.000');
    expect(copy).toContain('Rp 79.500');
    expect(buildReceipt(input('sale', 80)).join('\n')).not.toContain('SALINAN');
  });

  it('membungkus nama panjang tanpa memotong kata pendek', () => {
    expect(wrapText('Semen PCC Karya Mandiri', 12)).toEqual(['Semen PCC', 'Karya', 'Mandiri']);
    expect(wrapText('Satu', 12)).toEqual(['Satu']);
    expect(wrapText('A'.repeat(40), 10)).toEqual(['A'.repeat(10)]);
    expect(wrapText('', 10)).toEqual([]);
  });

  it('memberi lebih banyak baris bungkus pada 58 mm daripada 80 mm', () => {
    const narrow = buildReceipt(input('draft', 58)).length;
    const wide = buildReceipt(input('draft', 80)).length;
    expect(narrow).toBeGreaterThan(wide);
  });
});
