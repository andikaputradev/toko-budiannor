import { describe, expect, it } from 'vitest';
import { createStore } from '../../../src/shared/store/store';
import { buildInvoiceLines } from '../../../src/shared/data/invoice-lines';
import { discountAmount } from '../../../src/apps/pos/domain/bill';
import { EXPENSE_KINDS } from '../../../src/apps/pos/domain/forms';
import {
  filterHistory,
  groupEntriesByDay,
  returnDisplayNumbers,
  returnsOfSale,
} from '../../../src/apps/pos/domain/history';
import { itemsValue } from '../../../src/apps/pos/domain/retur';
import { applyMoneyKey } from '../../../src/apps/pos/domain/shift';
import { checkPart, MAX_SPLIT_PARTS } from '../../../src/apps/pos/domain/split';
import { EXPENSE_KIND_LABELS } from '../../../src/apps/pos/expense-support';
import { createPosSession, PAYMENT_NOTE_MAX } from '../../../src/apps/pos/pos-session';
import { label } from '../../../src/shared/messages';

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

describe('batas jual: hanya stok toko', () => {
  it('menolak barang berstok toko 0 walau gudang atau PO terisi', () => {
    const { session, store } = setup();
    const gembok = product(store, 'P-06');
    expect(gembok.stock.display).toBe(0);
    expect(session.addProduct(gembok, 'PCS')).toEqual({
      ok: false,
      reason: 'out-of-stock',
      available: 0,
    });
    expect(session.state().lines).toHaveLength(0);
  });

  it('menolak jumlah yang melebihi stok toko dan melaporkan sisa dalam satuan dasar', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    expect(cat.stock.display).toBe(7);
    expect(session.addProduct(cat, 'KLG', 5).ok).toBe(true);
    expect(session.addProduct(cat, 'KLG', 3)).toEqual({
      ok: false,
      reason: 'over-stock',
      available: 2,
    });
    expect(session.state().lines[0]?.quantity).toBe(5);
    expect(session.addProduct(cat, 'KLG', 2).ok).toBe(true);
    expect(session.addProduct(cat, 'KLG', 1)).toMatchObject({ ok: false, reason: 'over-stock' });
  });

  it('menghitung satuan besar dalam satuan dasar: satu dus 12 tidak muat di stok toko 7', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    expect(session.addProduct(cat, 'DOS', 1)).toMatchObject({ ok: false, reason: 'over-stock' });
    const lem = product(store, 'P-02');
    expect(lem.stock.display).toBe(78);
    expect(session.addProduct(lem, 'DOS', 1).ok).toBe(true);
    expect(session.addProduct(lem, 'LSN', 1)).toMatchObject({ ok: false, reason: 'over-stock' });
    expect(session.addProduct(lem, 'KLG', 6).ok).toBe(true);
  });

  it('setLineDetail menolak menambah jumlah melebihi stok toko tetapi mengizinkan menguranginya', () => {
    const { session, store } = setup();
    const semen = product(store, 'P-01');
    session.addProduct(semen, 'SAK', 20);
    expect(session.setLineDetail(0, { quantity: 29 })).toEqual({
      ok: false,
      labelKey: 'jumlahMelebihiStokToko',
    });
    expect(session.setLineDetail(0, { quantity: 28 }).ok).toBe(true);
    expect(session.setLineDetail(0, { quantity: 10 }).ok).toBe(true);
    expect(session.state().lines[0]?.quantity).toBe(10);
  });

  it('bill yang dipanggil dengan jumlah di atas stok masih bisa disimpan tanpa menambah jumlah', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 7);
    const held = session.holdBill();
    expect(held).toBeDefined();
    // Stok toko turun setelah bill ditahan (penjualan lain).
    store.applyStockChange({ [cat.id]: -4 });
    expect(session.recallBill(held?.id ?? '')).toEqual({ ok: true });
    expect(session.setLineDetail(0, { quantity: 7 }).ok).toBe(true);
    expect(session.setLineDetail(0, { quantity: 8 })).toEqual({
      ok: false,
      labelKey: 'jumlahMelebihiStokToko',
    });
    expect(session.setLineDetail(0, { quantity: 2 }).ok).toBe(true);
  });
});

describe('Diskon Transaksi', () => {
  it('mengurangi total, ikut ke penjualan, dan dihitung ulang saat baris berubah', () => {
    const { session, store } = setup();
    const semen = product(store, 'P-01');
    session.addProduct(semen, 'SAK', 3);
    expect(session.total()).toBe(210000);
    expect(session.setBillDiscount({ kind: 'persen', value: 10 })).toEqual({ ok: true });
    expect(session.subtotal()).toBe(210000);
    expect(session.billDiscountAmount()).toBe(21000);
    expect(session.total()).toBe(189000);
    session.addProduct(semen, 'SAK', 1);
    expect(session.total()).toBe(252000);
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    expect(sale).toMatchObject({ total: 252000, discount: 28000 });
    expect(session.state().billDiscount).toBeUndefined();
    expect(session.state().lines).toHaveLength(0);
  });

  it('diskon nominal dijepit pada subtotal dan ditolak bila melebihi', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    // Diskon tidak boleh menghabiskan total: transaksi Rp 0 tidak bisa dibayar.
    expect(session.setBillDiscount({ kind: 'nominal', value: 70000 })).toEqual({
      ok: false,
      labelKey: 'diskonMelebihi',
    });
    expect(session.setBillDiscount({ kind: 'persen', value: 100 })).toEqual({
      ok: false,
      labelKey: 'diskonMelebihi',
    });
    expect(session.setBillDiscount({ kind: 'nominal', value: -1 })).toEqual({
      ok: false,
      labelKey: 'diskonNegatif',
    });
    expect(session.setBillDiscount({ kind: 'nominal', value: 69999 })).toEqual({ ok: true });
    expect(session.total()).toBe(1);
    expect(session.setBillDiscount(undefined)).toEqual({ ok: true });
    expect(session.total()).toBe(70000);
  });

  it('ditolak untuk keranjang kosong (MSG-025)', () => {
    const { session } = setup();
    expect(session.setBillDiscount({ kind: 'persen', value: 5 })).toMatchObject({
      ok: false,
      messageId: 'MSG-025',
    });
  });

  it('Kasir butuh otorisasi, Frontliner ditolak, Supervisor langsung', () => {
    for (const [user, expected] of [
      ['U-3', { ok: false, labelKey: 'butuhOtorisasiHarga' }],
      ['U-5', { ok: false, messageId: 'MSG-003', values: {} }],
      ['U-2', { ok: true }],
    ] as const) {
      const { session, store } = setup(user);
      session.addProduct(product(store, 'P-01'), 'SAK', 1);
      expect(session.setBillDiscount({ kind: 'persen', value: 5 }), user).toEqual(expected);
    }
    const { session, store } = setup('U-3');
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    expect(session.setBillDiscount({ kind: 'persen', value: 5 }, true)).toEqual({ ok: true });
  });

  it('ikut tertahan pada Open Bill dan kembali saat bill dipanggil', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'nominal', value: 10000 });
    const held = session.holdBill();
    expect(held?.discount).toEqual({ kind: 'nominal', value: 10000 });
    expect(session.state().billDiscount).toBeUndefined();
    expect(session.recallBill(held?.id ?? '')).toEqual({ ok: true });
    expect(session.state().billDiscount).toEqual({ kind: 'nominal', value: 10000 });
    expect(session.total()).toBe(130000);
  });

  it('piutang menghitung sisa tagihan dari total setelah diskon transaksi', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'nominal', value: 20000 });
    session.chooseReceivable('piutang');
    const row = session.state().rows.find((item) => item.method === 'piutang');
    expect(row?.amount).toBe(120000);
    session.setBillDiscount({ kind: 'nominal', value: 30000 });
    expect(session.state().rows.find((item) => item.method === 'piutang')?.amount).toBe(110000);
  });

  it('nilai retur ikut dikurangi diskon transaksi secara proporsional', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'nominal', value: 14000 });
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    expect(sale).toMatchObject({ total: 126000, discount: 14000 });
    if (sale === undefined) {
      throw new Error('penjualan tidak jadi');
    }
    expect(itemsValue(sale, [{ index: 0, quantity: 1 }])).toBe(63000);
    expect(itemsValue(sale, [{ index: 0, quantity: 2 }])).toBe(126000);
  });
});

describe('catatan pembayaran dan pesanan baru', () => {
  it('catatan tersimpan pada penjualan, dipangkas, dan dikosongkan setelah selesai', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setPaymentNote('  Titip di pos satpam  ');
    expect(session.state().paymentNote).toBe('  Titip di pos satpam  ');
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    expect(sale?.note).toBe('Titip di pos satpam');
    expect(session.state().paymentNote).toBe('');
  });

  it('tanpa catatan penjualan tidak memuat kunci note, dan panjang dibatasi', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setPaymentNote('x'.repeat(PAYMENT_NOTE_MAX + 50));
    expect(session.state().paymentNote).toHaveLength(PAYMENT_NOTE_MAX);
    session.setPaymentNote('   ');
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    expect(sale).toBeDefined();
    expect(sale !== undefined && 'note' in sale).toBe(false);
  });

  it('catatan bertahan saat berganti tab pembayaran', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setPaymentNote('catatan');
    session.resetPayment();
    session.chooseSingle('qris');
    session.chooseReceivable('piutang');
    expect(session.state().paymentNote).toBe('catatan');
  });

  it('startNewOrder mengosongkan keranjang, pelanggan, diskon, catatan, dan pembayaran', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setCustomer('C-001');
    session.setBillDiscount({ kind: 'persen', value: 10 });
    session.setPaymentNote('catatan');
    session.chooseSingle('qris');
    session.startNewOrder();
    const state = session.state();
    expect(state.lines).toEqual([]);
    expect(state.customerId).toBeUndefined();
    expect(state.billDiscount).toBeUndefined();
    expect(state.paymentNote).toBe('');
    expect(state.rows).toEqual([]);
    expect(state.billRef).toBeUndefined();
    expect(session.state().heldBills).toHaveLength(3);
  });
});

describe('harga mengikuti kategori pelanggan', () => {
  it('pelanggan Grosir memakai harga grosir dan kembali ke eceran tanpa pelanggan', () => {
    const { session, store } = setup();
    const engsel = product(store, 'P-07');
    session.addProduct(engsel, 'PSG', 1);
    expect(session.state().lines[0]?.unitPrice).toBe(65000);
    const grosir = store.getState().data.customers.find((item) => item.tier === 'grosir');
    expect(grosir).toBeDefined();
    session.setCustomer(grosir?.id);
    expect(session.state().lines[0]?.unitPrice).toBe(55000);
    session.setCustomer(undefined);
    expect(session.state().lines[0]?.unitPrice).toBe(65000);
  });
});

describe('Split Payment maksimal tiga', () => {
  it('menerima indeks 0 sampai 2 dan menolak indeks ketiga ke atas', () => {
    expect(MAX_SPLIT_PARTS).toBe(3);
    const part = { method: 'tunai' as const, amount: 1000 };
    expect(checkPart([], 0, part)).toEqual({ ok: true });
    expect(checkPart([], 2, part)).toEqual({ ok: true });
    expect(checkPart([], 3, part)).toEqual({ ok: false, reason: 'maksimal' });
    expect(checkPart([], -1, part)).toEqual({ ok: false, reason: 'maksimal' });
  });

  it('sesi tidak menyimpan bagian keempat', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 4);
    session.setPart(0, { method: 'tunai', amount: 50000 });
    session.setPart(1, { method: 'qris', amount: 50000 });
    session.setPart(2, { method: 'edc', amount: 50000 });
    session.setPart(3, { method: 'transfer', amount: 50000 });
    expect(session.state().rows).toHaveLength(3);
  });
});

describe('jenis Biaya', () => {
  it('lima pilihan berurutan sesuai dokumen klien dengan labelnya', () => {
    expect(EXPENSE_KINDS).toEqual(['bensin', 'ekspedisi', 'makan', 'bongkar', 'lainnya']);
    expect(EXPENSE_KINDS.map((kind) => label(EXPENSE_KIND_LABELS[kind]))).toEqual([
      'Bensin Armada',
      'Bayar Ekspedisi',
      'Uang Makan Karyawan',
      'Upah Bongkar Muat',
      'Biaya Lainnya',
    ]);
  });

  it('Biaya Lainnya tetap mewajibkan catatan dan jenis baru bisa disimpan', () => {
    const { session } = setup();
    expect(session.saveExpense('makan', '', 25000)).toEqual({ ok: true });
    expect(session.saveExpense('bongkar', 'Kuli 3 orang', 90000)).toEqual({ ok: true });
    expect(session.saveExpense('lainnya', '', 10000)).toMatchObject({ messageId: 'MSG-042' });
    expect(session.state().expenses.map((item) => item.kind)).toEqual(['makan', 'bongkar']);
  });
});

describe('papan nominal 0, 00, 000', () => {
  it('00 dan 000 menambah dua dan tiga nol, dan tidak mengubah nilai nol', () => {
    expect(applyMoneyKey(0, '00')).toBe(0);
    expect(applyMoneyKey(0, '000')).toBe(0);
    expect(applyMoneyKey(12, '00')).toBe(1200);
    expect(applyMoneyKey(12, '000')).toBe(12000);
    expect(applyMoneyKey(5, '0')).toBe(50);
    expect(applyMoneyKey(123_456_789_012, '00')).toBe(123_456_789_012);
  });
});

describe('diskon per satuan pada data bangkitan', () => {
  it('rincian invoice memakai diskon nominal kurang dari harga satuan dan jumlahnya tetap tepat', () => {
    const { store } = setup();
    const products = store.getState().data.products;
    for (let index = 0; index < 60; index += 1) {
      const amount = 137_000 + index * 91_237;
      const lines = buildInvoiceLines(`KUNCI-${String(index)}`, amount, products, (item, unit) =>
        Math.round((item.prices[unit.code]?.eceran ?? 1000) * 1),
      );
      expect(lines.length).toBeLessThanOrEqual(4);
      let sum = 0;
      for (const line of lines) {
        sum += Math.round(line.quantity * line.unitPrice) - discountAmount(line);
        if (line.discount !== undefined) {
          expect(line.discount.kind).toBe('nominal');
          expect(line.discount.value).toBeLessThan(line.unitPrice);
        }
      }
      expect(sum).toBe(amount);
    }
  });
});

describe('retur terposting di Riwayat', () => {
  function sellAndReturn() {
    const { session, store, advance } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 4);
    session.chooseSingle('tunai');
    session.exactAmount();
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan tidak jadi');
    }
    advance(60_000);
    const first = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 70000 },
    });
    advance(60_000);
    const second = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'batal',
      note: '',
      refund: undefined,
    });
    expect(first.ok && second.ok).toBe(true);
    return { session, sale };
  }

  const everything = {
    start: '',
    end: '',
    status: 'semua' as const,
    query: '',
    onlyDevice: undefined,
  };

  it('memberi nomor penjualan asal diikuti urutan retur pada penjualan itu', () => {
    const { session, sale } = sellAndReturn();
    const numbers = returnDisplayNumbers(session.state().returns);
    expect([...numbers.values()]).toEqual([`${sale.number}.1`, `${sale.number}.2`]);
    expect(
      returnsOfSale(session.state().returns, sale.number).map((entry) => entry.number),
    ).toEqual([`${sale.number}.1`, `${sale.number}.2`]);
  });

  it('daftar Riwayat memuat penjualan dan returnya, terbaru lebih dulu', () => {
    const { session, sale } = sellAndReturn();
    const state = session.state();
    const entries = filterHistory(state.sales, state.returns, state.queue, everything, (id) =>
      session.customerName(id),
    );
    const mine = entries.filter((entry) => entry.kind === 'retur' || entry.number === sale.number);
    expect(mine.map((entry) => `${entry.kind}:${entry.number}`)).toEqual([
      `retur:${sale.number}.2`,
      `retur:${sale.number}.1`,
      `sale:${sale.number}`,
    ]);
    const retur = entries.find((entry) => entry.kind === 'retur');
    expect(retur?.kind === 'retur' ? retur.sale?.number : undefined).toBe(sale.number);
  });

  it('filter metode memilih retur menurut cara pengembalian dan status Pending menyingkirkan retur', () => {
    const { session, sale } = sellAndReturn();
    const state = session.state();
    const run = (patch: Partial<typeof everything> & { method?: 'tunai' | 'qris' | 'piutang' }) =>
      filterHistory(state.sales, state.returns, state.queue, { ...everything, ...patch }, (id) =>
        session.customerName(id),
      ).filter((entry) => entry.kind === 'retur');
    expect(run({})).toHaveLength(2);
    expect(run({ method: 'tunai' })).toHaveLength(1);
    expect(run({ method: 'qris' })).toHaveLength(0);
    expect(run({ method: 'piutang' })).toHaveLength(0);
    expect(run({ status: 'pending' as never })).toHaveLength(0);
    expect(run({ query: `${sale.number}.2`.toLowerCase() })).toHaveLength(1);
    expect(run({ query: 'tidak-ada' })).toHaveLength(0);
  });

  it('filter tanggal memakai tanggal retur dan pengelompokan per hari memuat retur', () => {
    const { session } = sellAndReturn();
    const state = session.state();
    const today = state.returns[0]?.at.slice(0, 10) ?? '';
    const inRange = filterHistory(
      state.sales,
      state.returns,
      state.queue,
      { ...everything, start: today, end: today },
      (id) => session.customerName(id),
    );
    expect(inRange.filter((entry) => entry.kind === 'retur')).toHaveLength(2);
    const outside = filterHistory(
      state.sales,
      state.returns,
      state.queue,
      { ...everything, start: '2000-01-01', end: '2000-01-02' },
      (id) => session.customerName(id),
    );
    expect(outside).toEqual([]);
    const groups = groupEntriesByDay(inRange);
    expect(groups.reduce((sum, group) => sum + group.entries.length, 0)).toBe(inRange.length);
  });
});

describe('Diskon Transaksi tidak tertinggal saat pesanan berubah', () => {
  it('dibuang saat keranjang dikosongkan sehingga barang berikutnya tidak ikut terdiskon', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'persen', value: 10 });
    session.deleteLine(0);
    expect(session.state().billDiscount).toBeUndefined();
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    expect(session.total()).toBe(70000);
  });

  it('dibuang bila perubahan harga membuat diskon nominal menghabiskan subtotal', () => {
    const { session, store } = setup('U-2');
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setBillDiscount({ kind: 'nominal', value: 60000 });
    expect(session.total()).toBe(10000);
    session.setLineDetail(0, { price: 50000 }, true);
    expect(session.state().billDiscount).toBeUndefined();
    expect(session.total()).toBe(50000);
  });

  it('tetap ada selama masih sah dan ikut berubah mengikuti subtotal', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'persen', value: 10 });
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    expect(session.state().billDiscount).toEqual({ kind: 'persen', value: 10 });
    expect(session.total()).toBe(189000);
  });
});

describe('peringatan stok toko pada Open Bill lama', () => {
  it('bill yang stoknya sudah terjual diberi peringatan dan tetap bisa dibayar atau dikurangi', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 7);
    const held = session.holdBill();
    store.applyStockChange({ [cat.id]: -4 });
    expect(session.recallBill(held?.id ?? '')).toEqual({ ok: true });
    expect(session.stockIssue()).toBe(
      label('stokTokoTerbatas', { nama: cat.name, jumlah: '3 KLG' }),
    );
    // Hanya peringatan: pembayaran tidak ditolak (stok negatif ditinjau di Back-Office).
    session.chooseSingle('tunai');
    session.exactAmount();
    expect(session.finish()).toMatchObject({ lines: [{ quantity: 7 }] });
  });

  it('peringatan hilang setelah jumlah dikurangi sampai muat di stok toko', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 7);
    const held = session.holdBill();
    store.applyStockChange({ [cat.id]: -4 });
    session.recallBill(held?.id ?? '');
    expect(session.stockIssue()).toBeDefined();
    expect(session.setLineDetail(0, { quantity: 3 }).ok).toBe(true);
    expect(session.stockIssue()).toBeUndefined();
  });

  it('stok toko habis dilaporkan sebagai stok kosong', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 2);
    const held = session.holdBill();
    store.applyStockChange({ [cat.id]: -7 });
    session.recallBill(held?.id ?? '');
    expect(session.stockIssue()).toBe(label('stokBarangKosong', { nama: cat.name }));
  });

  it('pesanan biasa tanpa kelebihan stok tidak punya masalah stok', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-03'), 'KLG', 7);
    expect(session.stockIssue()).toBeUndefined();
  });
});

describe('Diskon Transaksi pada Split Bill dan pemberitahuan pembuangan', () => {
  it('diskon nominal dibagi sebanding subtotal dan jumlah potongannya tetap', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 3);
    session.setBillDiscount({ kind: 'nominal', value: 21000 });
    const held = session.holdBill();
    expect(session.splitHeldBill(held?.id ?? '', [{ index: 0, quantity: 1 }])).toEqual({
      ok: true,
    });
    const kept = session.state().heldBills.find((bill) => bill.id === held?.id);
    const moved = session.state().heldBills.at(-1);
    // Subtotal 140.000 dan 70.000: potongan 21.000 terbagi 14.000 dan 7.000.
    expect(kept?.discount).toEqual({ kind: 'nominal', value: 14000 });
    expect(moved?.discount).toEqual({ kind: 'nominal', value: 7000 });
  });

  it('diskon persen ikut ke kedua bill dan bill tanpa diskon tetap tanpa kunci discount', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'persen', value: 10 });
    const held = session.holdBill();
    session.splitHeldBill(held?.id ?? '', [{ index: 0, quantity: 1 }]);
    const kept = session.state().heldBills.find((bill) => bill.id === held?.id);
    const moved = session.state().heldBills.at(-1);
    expect(kept?.discount).toEqual({ kind: 'persen', value: 10 });
    expect(moved?.discount).toEqual({ kind: 'persen', value: 10 });

    const other = setup();
    other.session.addProduct(product(other.store, 'P-01'), 'SAK', 2);
    const plain = other.session.holdBill();
    other.session.splitHeldBill(plain?.id ?? '', [{ index: 0, quantity: 1 }]);
    const pair = [
      other.session.state().heldBills.find((bill) => bill.id === plain?.id),
      other.session.state().heldBills.at(-1),
    ];
    expect(pair.every((bill) => bill !== undefined && bill.discount === undefined)).toBe(true);
  });

  it('tidak ada bill yang total akhirnya Rp 0 setelah dipecah', () => {
    const { session, store } = setup();
    session.addProduct(product(store, 'P-01'), 'SAK', 2);
    session.setBillDiscount({ kind: 'nominal', value: 139999 });
    const held = session.holdBill();
    session.splitHeldBill(held?.id ?? '', [{ index: 0, quantity: 1 }]);
    for (const id of [held?.id ?? '', session.state().heldBills.at(-1)?.id ?? '']) {
      session.recallBill(id);
      expect(session.total(), id).toBeGreaterThan(0);
      session.startNewOrder();
    }
  });

  it('memberi tahu kasir saat Diskon Transaksi dibuang otomatis, bukan saat keranjang kosong', () => {
    const { session, store } = setup('U-2');
    const notices: string[] = [];
    session.onNotice((text) => {
      notices.push(text);
    });
    session.addProduct(product(store, 'P-01'), 'SAK', 1);
    session.setBillDiscount({ kind: 'nominal', value: 60000 });
    session.setLineDetail(0, { price: 50000 }, true);
    expect(notices).toEqual([label('diskonTransaksiDibuang')]);
    session.setBillDiscount({ kind: 'persen', value: 10 });
    session.deleteLine(0);
    expect(notices).toHaveLength(1);
  });
});
