import { describe, expect, it } from 'vitest';
import { createStore } from '../../../src/shared/store/store';
import { generateDataset } from '../../../src/shared/data/generator';
import type { BillLine } from '../../../src/shared/data/types';
import {
  MAX_SHIPPING_FEE,
  netTotal,
  normalizeShippingFee,
} from '../../../src/apps/pos/domain/bill';
import { saleBreakdown } from '../../../src/apps/pos/domain/history';
import { buildReceipt } from '../../../src/apps/pos/domain/receipt';
import { itemsValue } from '../../../src/apps/pos/domain/retur';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { salesDraftFromNumber } from '../../../src/apps/bo/domain/sales-transaction';

// Revisi tambahan POS: Biaya Kirim di menu titik tiga (Open Bill, Diskon Transaksi, Biaya Kirim,
// Mulai Pesanan Baru). Biaya kirim menambah total, tidak terkena Diskon Transaksi, dan ikut tersimpan
// pada Open Bill, penjualan, struk, riwayat, dan faktur Back-Office.

function setup(userId = 'U-1') {
  const store = createStore({});
  store.setUser(userId);
  let now = 1_000_000;
  const session = createPosSession(store, {
    clock: () => now,
    schedule: (run) => {
      run();
    },
  });
  session.startShift(500_000);
  return { store, session, advance: (ms: number) => (now += ms) };
}

function product(store: ReturnType<typeof createStore>, id: string) {
  const found = store.getState().data.products.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
}

const SEMEN_LINES: readonly BillLine[] = [
  { productId: 'P-01', unit: 'SAK', quantity: 2, unitPrice: 70000 },
];

describe('total dengan Biaya Kirim', () => {
  it('netTotal menambah biaya kirim di luar diskon transaksi', () => {
    expect(netTotal(SEMEN_LINES, undefined, 25000)).toBe(165000);
    expect(netTotal(SEMEN_LINES, { kind: 'persen', value: 10 }, 25000)).toBe(151000);
    expect(netTotal(SEMEN_LINES, { kind: 'nominal', value: 140000 }, 25000)).toBe(25000);
    expect(netTotal(SEMEN_LINES, undefined)).toBe(140000);
  });

  it('normalizeShippingFee membulatkan dan menolak nilai tidak sah', () => {
    expect(normalizeShippingFee(25000)).toBe(25000);
    expect(normalizeShippingFee(25000.4)).toBe(25000);
    expect(normalizeShippingFee(0)).toBe(0);
    expect(normalizeShippingFee(-1)).toBeUndefined();
    expect(normalizeShippingFee(Number.NaN)).toBeUndefined();
    expect(normalizeShippingFee(MAX_SHIPPING_FEE)).toBe(MAX_SHIPPING_FEE);
    expect(normalizeShippingFee(MAX_SHIPPING_FEE + 1)).toBeUndefined();
  });
});

describe('sesi POS: Biaya Kirim', () => {
  it('menambah total, dan diskon transaksi hanya mengurangi subtotal barang', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    expect(session.shippingFee()).toBe(0);
    expect(session.setShippingFee(25000)).toEqual({ ok: true });
    expect(session.shippingFee()).toBe(25000);
    expect(session.subtotal()).toBe(140000);
    expect(session.total()).toBe(165000);
    session.setBillDiscount({ kind: 'persen', value: 10 });
    expect(session.billDiscountAmount()).toBe(14000);
    expect(session.total()).toBe(151000);
    expect(session.summary().total).toBe(151000);
  });

  it('nilai 0 menghapus biaya kirim; nilai tidak sah dan keranjang kosong ditolak', () => {
    const { session, store } = setup();
    expect(session.setShippingFee(5000)).toMatchObject({ ok: false, messageId: 'MSG-025' });
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    expect(session.setShippingFee(-5)).toMatchObject({ ok: false, messageId: 'MSG-030' });
    expect(session.setShippingFee(MAX_SHIPPING_FEE + 1)).toMatchObject({
      ok: false,
      messageId: 'MSG-030',
    });
    expect(session.setShippingFee(30000)).toEqual({ ok: true });
    expect(session.total()).toBe(100000);
    expect(session.setShippingFee(0)).toEqual({ ok: true });
    expect(session.shippingFee()).toBe(0);
    expect(session.total()).toBe(70000);
  });

  it('semua peran penjual boleh memberi biaya kirim, termasuk Frontliner', () => {
    for (const user of ['U-1', 'U-2', 'U-3', 'U-5']) {
      const { session, store } = setup(user);
      session.addProduct(product(store, 'P-01'), 'SAK', 1);
      expect(session.setShippingFee(10000), user).toEqual({ ok: true });
    }
  });

  it('hilang saat keranjang dikosongkan atau Pesanan Baru dimulai', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setShippingFee(10000);
    session.deleteLine(0);
    expect(session.shippingFee()).toBe(0);
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setShippingFee(10000);
    session.startNewOrder();
    expect(session.shippingFee()).toBe(0);
    expect(session.state().shippingFee).toBe(0);
  });

  it('ikut tertahan pada Open Bill dan kembali saat bill dipanggil', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setShippingFee(20000);
    const held = session.holdBill();
    expect(held?.shipping).toBe(20000);
    expect(session.shippingFee()).toBe(0);
    expect(session.recallBill(held?.id ?? '')).toEqual({ ok: true });
    expect(session.shippingFee()).toBe(20000);
    expect(session.total()).toBe(160000);
  });

  it('bill tanpa biaya kirim tidak memuat kunci shipping', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    const held = session.holdBill();
    expect(held !== undefined && 'shipping' in held).toBe(false);
  });

  it('Split Bill menyisakan biaya kirim di bill asal, Merge Bill menjumlahkannya', () => {
    const { session, store } = setup();
    const semen = product(store, 'P-01');
    session.addProduct(semen, 'SAK', 4);
    session.setShippingFee(15000);
    const first = session.holdBill();
    session.addProduct(semen, 'SAK', 1);
    session.setShippingFee(5000);
    const second = session.holdBill();
    if (first === undefined || second === undefined) {
      throw new Error('bill tidak jadi');
    }
    expect(session.splitHeldBill(first.id, [{ index: 0, quantity: 1 }])).toEqual({ ok: true });
    const bills = session.state().heldBills;
    const kept = bills.find((item) => item.id === first.id);
    const moved = bills[bills.length - 1];
    expect(kept?.shipping).toBe(15000);
    expect(moved?.shipping).toBeUndefined();
    expect(session.mergeHeldBills(first.id, second.id)).toEqual({ ok: true });
    expect(session.state().heldBills.find((item) => item.id === first.id)?.shipping).toBe(20000);
  });

  it('piutang menghitung sisa tagihan dari total termasuk biaya kirim', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setShippingFee(10000);
    session.chooseReceivable('piutang');
    expect(session.state().rows.find((row) => row.method === 'piutang')?.amount).toBe(150000);
    session.setShippingFee(20000);
    expect(session.state().rows.find((row) => row.method === 'piutang')?.amount).toBe(160000);
  });
});

describe('penjualan dengan Biaya Kirim', () => {
  function sell(withDiscount: boolean) {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setShippingFee(25000);
    if (withDiscount) {
      session.setBillDiscount({ kind: 'nominal', value: 14000 });
    }
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan tidak jadi');
    }
    return { sale, session, store };
  }

  it('Sale memuat shipping dan total sudah menyertakannya; keranjang bersih lagi', () => {
    const { sale, session } = sell(false);
    expect(sale).toMatchObject({ total: 165000, shipping: 25000, paid: 165000 });
    expect(session.state().shippingFee).toBe(0);
    expect(session.state().lines).toHaveLength(0);
  });

  it('tanpa biaya kirim penjualan tidak memuat kunci shipping', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    expect(sale !== undefined && 'shipping' in sale).toBe(false);
  });

  it('rincian riwayat memisahkan subtotal, diskon, biaya kirim, dan total', () => {
    const { sale } = sell(true);
    expect(sale).toMatchObject({ total: 151000, discount: 14000, shipping: 25000 });
    expect(saleBreakdown(sale)).toEqual({
      subtotal: 140000,
      discount: 0,
      transactionDiscount: 14000,
      shipping: 25000,
      grandTotal: 151000,
    });
  });

  it('struk memuat baris Biaya Kirim sebelum total', () => {
    const { sale } = sell(false);
    const lines = buildReceipt({
      kind: 'sale',
      number: sale.number,
      at: new Date(sale.createdAt),
      cashier: 'Kasir',
      customer: 'Umum',
      items: [
        { name: 'SEMEN GRESIK 40KG', quantity: 2, unit: 'SAK', unitPrice: 70000, subtotal: 140000 },
      ],
      total: sale.total,
      payments: [{ method: 'Tunai', amount: sale.total }],
      change: 0,
      shipping: sale.shipping,
    });
    const shippingAt = lines.findIndex((line) => line.includes('Biaya Kirim'));
    const totalAt = lines.findIndex((line) => line.includes('TOTAL'));
    expect(shippingAt).toBeGreaterThan(0);
    expect(shippingAt).toBeLessThan(totalAt);
    expect(lines[shippingAt]).toContain('Rp 25.000');
  });

  it('nilai retur hanya menghitung barang, biaya kirim tidak ikut dikembalikan', () => {
    const { sale } = sell(false);
    expect(itemsValue(sale, [{ index: 0, quantity: 2 }])).toBe(140000);
    expect(itemsValue(sale, [{ index: 0, quantity: 1 }])).toBe(70000);
    const discounted = sell(true).sale;
    // Total barang setelah diskon transaksi 126.000; biaya kirim 25.000 tidak dikembalikan.
    expect(itemsValue(discounted, [{ index: 0, quantity: 2 }])).toBe(126000);
    expect(itemsValue(discounted, [{ index: 0, quantity: 1 }])).toBe(63000);
  });

  it('faktur Back-Office memuat biaya kirim sebagai ongkos kirim', () => {
    const { sale } = sell(false);
    const dataset = { ...generateDataset(), sales: [sale] };
    const draft = salesDraftFromNumber(dataset, sale.number);
    expect(draft?.expeditionFee).toBe(25000);
    expect(draft?.grandTotal).toBe(165000);
  });
});
