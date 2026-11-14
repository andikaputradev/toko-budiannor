import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import { createStore } from '../../../src/shared/store/store';
import { discountAmount } from '../../../src/apps/pos/domain/bill';
import { saleBreakdown } from '../../../src/apps/pos/domain/history';
import {
  buildReceipt,
  RECEIPT_CHARS,
  wrapText,
  type ReceiptInput,
  type ReceiptItem,
} from '../../../src/apps/pos/domain/receipt';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { returnReceipt, saleReceipt } from '../../../src/apps/pos/screens/receipt-preview';

function input(kind: ReceiptInput['kind']): ReceiptInput {
  return {
    kind,
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

describe('struk 80 mm', () => {
  it('memakai 48 karakter per baris', () => {
    expect(RECEIPT_CHARS).toBe(48);
  });

  for (const kind of ['draft', 'sale', 'copy'] as const) {
    it(`tidak melebihi lebar kertas untuk ${kind}`, () => {
      const lines = buildReceipt(input(kind));
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(RECEIPT_CHARS);
      }
    });
  }

  it('menulis judul struk draf persis dan tanpa harga atau harga modal', () => {
    const text = buildReceipt(input('draft')).join('\n');
    expect(text).toContain('STRUK DRAF, BUKAN BUKTI BAYAR');
    expect(text).toContain('B-0003');
    expect(text).not.toContain('Rp');
    expect(text).toContain('1,5 Sak');
  });

  it('menandai salinan dan memuat total, pembayaran, dan kembalian pada struk penjualan', () => {
    const copy = buildReceipt(input('copy')).join('\n');
    expect(copy).toContain('SALINAN');
    expect(copy).toContain('Rp 820.500');
    expect(copy).toContain('Rp 900.000');
    expect(copy).toContain('Rp 79.500');
    expect(buildReceipt(input('sale')).join('\n')).not.toContain('SALINAN');
  });

  it('membungkus nama panjang tanpa memotong kata pendek', () => {
    expect(wrapText('Semen PCC Karya Mandiri', 12)).toEqual(['Semen PCC', 'Karya', 'Mandiri']);
    expect(wrapText('Satu', 12)).toEqual(['Satu']);
    expect(wrapText('A'.repeat(40), 10)).toEqual(['A'.repeat(10)]);
    expect(wrapText('', 10)).toEqual([]);
  });
});

describe('struk bukti retur', () => {
  it('memuat judul BUKTI RETUR, tanpa kembalian, dan muat 48 karakter', () => {
    const lines = buildReceipt({
      ...input('retur'),
      number: 'R-0001',
      total: 140000,
      payments: [{ method: 'QRIS', amount: 140000 }],
      change: 0,
    });
    const text = lines.join('\n');
    expect(text).toContain('BUKTI RETUR');
    expect(text).toContain('R-0001');
    expect(text).not.toContain('Kembalian');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_CHARS);
    }
  });
});

describe('struk dengan diskon dan perubahan harga', () => {
  const semenItem: ReceiptItem = {
    name: 'Semen Gresik 40kg',
    quantity: 3,
    unit: 'Sak',
    unitPrice: 70000,
    subtotal: 210000,
  };
  const plainItems: ReceiptInput['items'] = [
    semenItem,
    { name: 'Paku 2 inci', quantity: 10, unit: 'Kg', unitPrice: 15200, subtotal: 152000 },
  ];
  const base: ReceiptInput = {
    kind: 'sale',
    number: 'T-000141',
    at: new Date('2026-10-19T03:00:00Z'),
    cashier: 'Dewi',
    customer: 'Umum',
    items: plainItems,
    total: 362000,
    payments: [{ method: 'Tunai', amount: 400000 }],
    change: 38000,
  };

  it('memuat baris Diskon tanpa harga asli, dengan harga setelah ubah pada baris jumlah', () => {
    const lines = buildReceipt({
      ...base,
      items: [
        {
          name: 'Semen Gresik 40kg',
          quantity: 3,
          unit: 'Sak',
          unitPrice: 65000,
          subtotal: 195000,
          discount: 19500,
        },
      ],
      total: 175500,
      payments: [{ method: 'Tunai', amount: 200000 }],
      change: 24500,
    });
    const text = lines.join('\n');
    expect(text).toContain('3 Sak x Rp 65.000');
    expect(text).toContain('Rp 195.000');
    expect(text).not.toContain('Harga asli');
    expect(text).not.toContain('70.000');
    expect(lines.some((line) => /^\s*Diskon\s+-Rp 19\.500$/.test(line))).toBe(true);
    expect(text).toContain('Rp 175.500');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_CHARS);
    }
  });

  it('struk tanpa diskon tidak berubah: cetakan lama sama persis', () => {
    const legacy = buildReceipt(base);
    const withUndefined = buildReceipt({
      ...base,
      items: plainItems.map((item) => ({ ...item, discount: undefined })),
    });
    const withZero = buildReceipt({
      ...base,
      items: plainItems.map((item) => ({ ...item, discount: 0 })),
    });
    expect(withUndefined).toEqual(legacy);
    expect(withZero).toEqual(legacy);
    expect(legacy.join('\n')).not.toContain('Diskon');
    expect(legacy.join('\n')).not.toContain('Harga asli');
  });

  it('struk 80 mm menaruh Diskon rata kanan tanpa melebihi 48 karakter', () => {
    const lines = buildReceipt({
      ...base,
      items: [{ ...semenItem, discount: 21000 }],
      total: 189000,
      payments: [{ method: 'Tunai', amount: 189000 }],
      change: 0,
    });
    const discount = lines.find((line) => line.includes('Diskon'));
    expect(discount).toBeDefined();
    expect(discount?.length).toBe(RECEIPT_CHARS);
    expect(discount?.endsWith('-Rp 21.000')).toBe(true);
  });
});

describe('struk dari penjualan berdiskon dan konsistensi riwayat', () => {
  const dataset = withProposalData(generateDataset());

  function sellDiscounted() {
    const store = createStore({ dataset });
    store.setUser('U-2');
    const session = createPosSession(store, { clock: () => 1_000_000 });
    session.startShift(100000);
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 3);
    session.setLineDetail(0, { price: 65000, discount: { kind: 'persen', value: 10 } });
    session.exactAmount();
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan gagal');
    }
    return { session, sale };
  }

  it('saleReceipt memuat jumlah kotor, diskon, dan total setelah diskon tanpa harga asli', () => {
    const { session, sale } = sellDiscounted();
    const receipt = saleReceipt(session, sale, 'sale');
    expect(sale.total).toBe(175500);
    expect(receipt.total).toBe(175500);
    expect(receipt.items[0]).toMatchObject({
      unitPrice: 65000,
      subtotal: 195000,
      discount: 19500,
    });
    expect(receipt.items[0]).not.toHaveProperty('listPrice');
  });

  it('saleBreakdown cocok dengan baris: subtotal kotor, diskon dari baris, dan grand total', () => {
    const { sale } = sellDiscounted();
    const breakdown = saleBreakdown(sale);
    const fromLines = sale.lines.reduce((sum, line) => sum + discountAmount(line), 0);
    expect(breakdown.subtotal).toBe(195000);
    expect(breakdown.discount).toBe(fromLines);
    expect(breakdown.discount).toBe(19500);
    expect(breakdown.subtotal - breakdown.discount).toBe(breakdown.grandTotal);
    expect(breakdown.grandTotal).toBe(sale.total);
  });

  it('transaksi tanpa diskon: diskon nol dan subtotal sama dengan grand total', () => {
    const store = createStore({ dataset });
    store.setUser('U-2');
    const session = createPosSession(store, { clock: () => 1_000_000 });
    session.startShift(100000);
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 2);
    session.exactAmount();
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan gagal');
    }
    const breakdown = saleBreakdown(sale);
    expect(breakdown).toEqual({
      subtotal: 140000,
      discount: 0,
      transactionDiscount: 0,
      grandTotal: 140000,
    });
    expect(saleReceipt(session, sale, 'sale').items[0]).not.toHaveProperty('discount');
  });

  it('bukti retur atas baris berdiskon memuat nilai proporsional', () => {
    const { session, sale } = sellDiscounted();
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 58500 },
    });
    expect(result).toMatchObject({ ok: true, value: 58500 });
    const record = session.state().returns[0];
    if (record === undefined) {
      throw new Error('retur tidak tersimpan');
    }
    const receipt = returnReceipt(session, record);
    expect(receipt.items[0]?.subtotal).toBe(58500);
    expect(receipt.total).toBe(58500);
  });
});

describe('struk: Diskon Transaksi dan catatan', () => {
  const base: ReceiptInput = {
    kind: 'sale',
    number: 'T-000150',
    at: new Date('2026-10-19T03:00:00Z'),
    cashier: 'Dewi',
    customer: 'Umum',
    items: [
      { name: 'Semen Gresik 40kg', quantity: 2, unit: 'Sak', unitPrice: 70000, subtotal: 140000 },
    ],
    total: 126000,
    payments: [{ method: 'Tunai', amount: 150000 }],
    change: 24000,
  };

  it('mencetak Diskon Transaksi sebelum total dan catatan setelah kembalian', () => {
    const lines = buildReceipt({ ...base, transactionDiscount: 14000, note: 'Titip di satpam' });
    const text = lines.join('\n');
    expect(lines.some((line) => /^Diskon Transaksi\s+-Rp 14\.000$/.test(line))).toBe(true);
    expect(text.indexOf('Diskon Transaksi')).toBeLessThan(text.indexOf('TOTAL'));
    expect(text).toContain('Catatan: Titip di satpam');
    expect(text.indexOf('Kembalian')).toBeLessThan(text.indexOf('Catatan:'));
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_CHARS);
    }
  });

  it('tanpa diskon transaksi dan catatan struk sama dengan sebelumnya', () => {
    const plain = buildReceipt(base);
    expect(buildReceipt({ ...base, transactionDiscount: 0, note: '  ' })).toEqual(plain);
    expect(plain.join('\n')).not.toContain('Diskon Transaksi');
    expect(plain.join('\n')).not.toContain('Catatan');
  });

  it('catatan panjang dibungkus dan tidak melebihi lebar kertas', () => {
    const lines = buildReceipt({
      ...base,
      note: 'Barang diantar sore hari ke gudang belakang lewat pintu samping',
    });
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_CHARS);
    }
    expect(lines.filter((line) => /Catatan|gudang|samping/.test(line)).length).toBeGreaterThan(1);
  });
});
