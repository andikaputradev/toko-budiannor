import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { totalStock } from '../../../src/shared/data/units';
import { createStore } from '../../../src/shared/store/store';
import { createPosSession } from '../../../src/apps/pos/pos-session';

const dataset = generateDataset();

function setup(userId = 'U-3', online = true) {
  const store = createStore({ dataset });
  store.setUser(userId);
  store.setOnline(online);
  let now = 1_000_000;
  const session = createPosSession(store, {
    clock: () => now,
    schedule: (run) => {
      run();
    },
  });
  return { store, session, advance: (ms: number) => (now += ms) };
}

function first() {
  const product = dataset.products[0];
  if (product === undefined) {
    throw new Error('data kosong');
  }
  return product;
}

describe('bill gantung', () => {
  it('menolak panggil bill saat bill berjalan tidak kosong (MSG-028)', () => {
    const { session } = setup();
    session.addProduct(first());
    expect(session.recallBill('H-1')).toMatchObject({ ok: false, messageId: 'MSG-028' });
  });

  it('memuat seluruh item bill ke POS-02 dan menghapusnya dari daftar gantung', () => {
    const { session } = setup();
    const target = session.state().heldBills[2];
    expect(session.recallBill('H-3')).toEqual({ ok: true });
    expect(session.state().lines).toEqual(target?.lines);
    expect(session.state().heldBills.map((bill) => bill.id)).toEqual(['H-1', 'H-2']);
    expect(session.customer()?.id).toBe(target?.customerId);
  });

  it('melarang Kasir dan Frontliner menghapus bill, tetapi mengizinkan Supervisor dan Owner', () => {
    for (const user of ['U-3', 'U-5']) {
      const { session } = setup(user);
      expect(session.deleteHeldBill('H-1')).toMatchObject({ ok: false, messageId: 'MSG-003' });
      expect(session.state().heldBills).toHaveLength(3);
    }
    for (const user of ['U-2', 'U-1']) {
      const { session } = setup(user);
      expect(session.deleteHeldBill('H-1')).toEqual({ ok: true });
      expect(session.state().heldBills).toHaveLength(2);
      expect(session.state().activity[0]?.action).toBe('Hapus bill');
    }
  });

  it('mengikuti tanggal demo saat memberi waktu bill baru', () => {
    const { session, advance } = setup();
    session.addProduct(first());
    advance(60_000);
    const held = session.holdBill();
    expect(held?.createdAt).toBe('2026-10-19T03:01:00.000Z');
  });
});

describe('biaya kasir', () => {
  it('memvalidasi jumlah, keterangan Lainnya, dan saldo kas', () => {
    const { session } = setup();
    session.startShift(1337000);
    expect(session.saveExpense('parkir', '', 0)).toMatchObject({ messageId: 'MSG-029' });
    expect(session.saveExpense('lainnya', ' ', 5000)).toMatchObject({ messageId: 'MSG-042' });
    expect(session.saveExpense('parkir', '', 2000000)).toMatchObject({
      messageId: 'MSG-041',
      values: { saldo: 'Rp 1.337.000' },
    });
  });

  it('mengurangi saldo kas dan mencatat biaya', () => {
    const { session } = setup();
    session.startShift(1337000);
    expect(session.cashBalance()).toBe(1337000);
    expect(session.saveExpense('parkir', '', 5000)).toEqual({ ok: true });
    expect(session.cashBalance()).toBe(1332000);
    expect(session.state().expenses).toHaveLength(1);
    expect(session.saveExpense('bensin', '', 1332000)).toEqual({ ok: true });
    expect(session.saveExpense('bensin', '', 1)).toMatchObject({ messageId: 'MSG-041' });
  });

  it('memasukkan biaya ke antrean hanya saat offline', () => {
    const online = setup('U-3', true);
    online.session.startShift(1337000);
    online.session.saveExpense('parkir', '', 5000);
    expect(online.session.pendingQueue()).toBe(3);
    const offline = setup('U-3', false);
    offline.session.startShift(1337000);
    offline.session.saveExpense('parkir', '', 5000);
    expect(offline.session.pendingQueue()).toBe(4);
    expect(offline.session.state().queue.at(-1)).toMatchObject({ kind: 'biaya', total: 5000 });
  });
});

describe('pelanggan baru', () => {
  const input = {
    name: 'Toko Baru',
    phone: '081234567890',
    address: '',
    tier: 'grosir' as const,
    limit: 0,
    dueDays: 30,
  };

  it('menolak nama kosong, duplikat, dan limit dari Kasir', () => {
    const { session } = setup();
    expect(session.registerCustomer({ ...input, name: ' ' })).toMatchObject({
      field: 'name',
      messageId: 'MSG-043',
    });
    expect(session.registerCustomer({ ...input, limit: 1000 })).toMatchObject({
      field: 'limit',
      messageId: 'MSG-046',
    });
    const existing = dataset.customers[0];
    expect(
      session.registerCustomer({
        ...input,
        name: existing?.name ?? '',
        phone: existing?.phone ?? '',
      }),
    ).toMatchObject({ field: 'duplicate', messageId: 'MSG-045' });
  });

  it('mengizinkan limit dari Supervisor, memilih pelanggan di bill, dan menghitung ulang harga', () => {
    const { session, store } = setup('U-2');
    session.addProduct(first(), 'Sak');
    const before = session.state().lines[0]?.unitPrice ?? 0;
    const result = session.registerCustomer({ ...input, limit: 5000000 });
    expect(result.ok).toBe(true);
    expect(session.customer()?.name).toBe('Toko Baru');
    expect(store.getState().data.customers).toHaveLength(61);
    expect(session.state().lines[0]?.unitPrice).toBeLessThan(before);
    expect(session.registerCustomer(input)).toMatchObject({ field: 'duplicate' });
  });
});

describe('antrean sinkronisasi', () => {
  it('mengubah Menunggu menjadi Terkirim saat koneksi pulih', () => {
    const { session, store } = setup('U-3', false);
    session.addProduct(first(), 'Sak', 2);
    session.exactAmount();
    session.finish();
    expect(session.pendingQueue()).toBe(4);
    expect(session.syncNow()).toMatchObject({ ok: false, messageId: 'MSG-047' });
    store.setOnline(true);
    expect(session.pendingQueue()).toBe(0);
    expect(session.state().queue.every((item) => item.status === 'terkirim')).toBe(true);
    expect(session.state().syncing).toBeUndefined();
    expect(session.state().lastSync).not.toBe('2026-10-17T07:20:00.000Z');
  });

  it('menandai transaksi offline sebagai belum tersinkron lalu tersinkron', () => {
    const { session, store } = setup('U-3', false);
    session.addProduct(first());
    session.exactAmount();
    const sale = session.finish();
    expect(session.state().queue.some((item) => item.saleNumber === sale?.number)).toBe(true);
    store.setOnline(true);
    expect(session.state().queue.find((item) => item.saleNumber === sale?.number)?.status).toBe(
      'terkirim',
    );
  });

  it('menghentikan pengiriman bila koneksi putus di tengah jalan', () => {
    const store = createStore({ dataset });
    store.setUser('U-3');
    const pending: (() => void)[] = [];
    const session = createPosSession(store, { schedule: (run) => pending.push(run) });
    store.setOnline(false);
    store.setOnline(true);
    expect(session.state().syncing).toEqual({ current: 1, total: 3 });
    store.setOnline(false);
    pending.shift()?.();
    expect(session.state().syncing).toBeUndefined();
    expect(session.state().queue.every((item) => item.status === 'menunggu')).toBe(true);
  });
});

describe('stok negatif, printer, dan otorisasi offline', () => {
  it('menandai Ditinjau (negatif) saat stok total kurang dari 0', () => {
    const { session, store } = setup('U-3', false);
    session.addProduct(first(), 'Sak', 9999);
    session.exactAmount();
    session.finish();
    const product = store.getState().data.products[0];
    expect(totalStock(product ?? first())).toBeLessThan(0);
    expect(store.getState().negativeReview).toContain(first().id);
  });

  it('tidak menandai barang yang stoknya masih cukup', () => {
    const { session, store } = setup();
    session.addProduct(first(), 'Kg', 1);
    session.exactAmount();
    session.finish();
    expect(store.getState().negativeReview).toEqual([]);
  });

  it('menahan struk bila printer terputus dan mencetak ulang saat terhubung', () => {
    const { session, store } = setup();
    store.setPrinter(false);
    session.addProduct(first());
    session.exactAmount();
    const sale = session.finish();
    expect(session.state().printPending).toBe(sale?.number);
    expect(session.retryPrint()).toMatchObject({ ok: false, messageId: 'MSG-018' });
    expect(session.printReceipt('copy', 'T-000101')).toMatchObject({ messageId: 'MSG-040' });
    store.setPrinter(true);
    expect(session.retryPrint()).toEqual({ ok: true });
    expect(session.state().printPending).toBeUndefined();
    expect(session.printReceipt('copy', 'T-000101')).toEqual({ ok: true });
    expect(session.state().activity.at(-1)?.action).toBe('Cetak ulang struk');
  });

  it('mencatat otorisasi offline untuk ditinjau saat sinkron (A-12)', () => {
    const { session } = setup('U-2', false);
    expect(session.authorizeOwner('Salah harga', '482916', 'koreksi', 'T-000103')).toEqual({
      ok: true,
    });
    expect(session.state().audit[0]).toMatchObject({ ownerName: 'Bapak Haris', offline: true });
    expect(session.state().queue.at(-1)).toMatchObject({ kind: 'otorisasi', status: 'menunggu' });
    expect(session.state().ownerApproved).toBe(false);
  });
});

describe('retur penjualan', () => {
  function target() {
    const { session, store } = setup('U-2');
    const sale = session
      .state()
      .sales.find((item) => item.lines.some((line) => line.quantity >= 1));
    const index = sale?.lines.findIndex((line) => line.quantity >= 1) ?? 0;
    return { session, store, sale, index };
  }

  it('melarang Frontliner meretur', () => {
    const { session } = setup('U-5');
    expect(session.returnSale('T-000101', [{ index: 0, quantity: 1 }], 'rusak')).toMatchObject({
      messageId: 'MSG-003',
    });
  });

  it('memeriksa item, jumlah, dan alasan dengan pesan Lampiran C', () => {
    const { session, sale, index } = target();
    const number = sale?.number ?? '';
    const bought = sale?.lines[index]?.quantity ?? 0;
    expect(session.returnSale(number, [], 'rusak')).toMatchObject({ messageId: 'MSG-084' });
    expect(session.returnSale(number, [{ index, quantity: bought + 1 }], 'rusak')).toMatchObject({
      messageId: 'MSG-085',
    });
    expect(session.returnSale(number, [{ index, quantity: 0.5 }], ' ')).toMatchObject({
      messageId: 'MSG-086',
    });
  });

  it('menambah stok, menghitung nilai dari harga transaksi, dan membatasi total retur', () => {
    const { session, store, sale, index } = target();
    const number = sale?.number ?? '';
    const line = sale?.lines[index];
    const product = session.product(line?.productId ?? '');
    const before = totalStock(
      store.getState().data.products.find((item) => item.id === product?.id) ?? first(),
    );
    const result = session.returnSale(number, [{ index, quantity: 0.5 }], 'rusak');
    expect(result).toMatchObject({
      ok: true,
      number: 'R-0001',
      value: Math.round(0.5 * (line?.unitPrice ?? 0)),
    });
    const after = totalStock(
      store.getState().data.products.find((item) => item.id === product?.id) ?? first(),
    );
    expect(after).toBeGreaterThan(before);
    expect(session.returnedQuantity(number, index)).toBe(0.5);
    const room = (line?.quantity ?? 0) - 0.5;
    expect(session.returnSale(number, [{ index, quantity: room + 0.1 }], 'rusak')).toMatchObject({
      messageId: 'MSG-085',
    });
  });
});

describe('detail baris pesanan', () => {
  function withLine(userId: string) {
    const harness = setup(userId);
    harness.session.addProduct(first(), undefined, 2);
    const line = harness.session.state().lines[0];
    if (line === undefined) {
      throw new Error('baris tidak ada');
    }
    return { ...harness, original: line.unitPrice };
  }

  it('Supervisor mengubah harga dan listPrice asli tersimpan, price null memulihkannya', () => {
    const { session, original } = withLine('U-2');
    expect(session.setLineDetail(0, { price: original - 5000 })).toEqual({ ok: true });
    expect(session.state().lines[0]).toMatchObject({
      unitPrice: original - 5000,
      listPrice: original,
    });
    expect(session.setLineDetail(0, { price: original - 7000 })).toEqual({ ok: true });
    expect(session.state().lines[0]?.listPrice).toBe(original);
    expect(session.setLineDetail(0, { price: null })).toEqual({ ok: true });
    expect(session.state().lines[0]?.unitPrice).toBe(original);
    expect(session.state().lines[0]?.listPrice).toBeUndefined();
    expect(session.setLineDetail(0, { price: original })).toEqual({ ok: true });
    expect(session.state().lines[0]?.listPrice).toBeUndefined();
  });

  it('harga nol, negatif, atau pecahan ditolak dan baris tidak berubah', () => {
    const { session, original } = withLine('U-2');
    for (const price of [0, -1, 100.5, Number.NaN]) {
      expect(session.setLineDetail(0, { price })).toEqual({ ok: false, labelKey: 'hargaTidakSah' });
    }
    expect(session.state().lines[0]?.unitPrice).toBe(original);
  });

  it('diskon disimpan, dihapus lewat null, dan nilai yang tidak sah ditolak', () => {
    const { session } = withLine('U-2');
    expect(session.setLineDetail(0, { discount: { kind: 'persen', value: 10 } })).toEqual({
      ok: true,
    });
    expect(session.state().lines[0]?.discount).toEqual({ kind: 'persen', value: 10 });
    expect(session.setLineDetail(0, { discount: { kind: 'persen', value: 101 } })).toEqual({
      ok: false,
      labelKey: 'diskonMelebihi',
    });
    expect(session.setLineDetail(0, { discount: { kind: 'nominal', value: -1 } })).toEqual({
      ok: false,
      labelKey: 'diskonNegatif',
    });
    expect(session.state().lines[0]?.discount).toEqual({ kind: 'persen', value: 10 });
    expect(session.setLineDetail(0, { discount: null })).toEqual({ ok: true });
    expect(session.state().lines[0]?.discount).toBeUndefined();
    expect(session.setLineDetail(0, { discount: { kind: 'nominal', value: 0 } })).toEqual({
      ok: true,
    });
    expect(session.state().lines[0]?.discount).toBeUndefined();
  });

  it('Kasir tanpa otorisasi ditolak mengubah harga atau diskon, Supervisor dan Owner langsung boleh', () => {
    const { session, original } = withLine('U-3');
    expect(session.setLineDetail(0, { price: original - 1000 })).toEqual({
      ok: false,
      labelKey: 'butuhOtorisasiHarga',
    });
    expect(session.setLineDetail(0, { discount: { kind: 'persen', value: 5 } })).toEqual({
      ok: false,
      labelKey: 'butuhOtorisasiHarga',
    });
    expect(session.state().lines[0]).toMatchObject({ unitPrice: original });
    expect(session.setLineDetail(0, { price: original - 1000 }, true)).toEqual({ ok: true });
    expect(session.setLineDetail(0, { discount: { kind: 'persen', value: 5 } }, true)).toEqual({
      ok: true,
    });
    for (const user of ['U-2', 'U-1']) {
      const supervisor = withLine(user);
      expect(supervisor.session.setLineDetail(0, { price: supervisor.original - 1000 })).toEqual({
        ok: true,
      });
    }
  });

  it('Frontliner tidak boleh mengubah harga atau diskon walau diberi otorisasi', () => {
    const { session, original } = withLine('U-5');
    expect(session.setLineDetail(0, { price: original - 1000 }, true)).toMatchObject({
      ok: false,
      messageId: 'MSG-003',
    });
    expect(
      session.setLineDetail(0, { discount: { kind: 'persen', value: 5 } }, true),
    ).toMatchObject({ ok: false, messageId: 'MSG-003' });
    expect(session.setLineDetail(0, { note: 'Antar sore' })).toEqual({ ok: true });
  });

  it('otorisasi dengan tujuan harga menyimpan entri audit dan menerima PIN Supervisor atau Owner', () => {
    const owner = withLine('U-3');
    expect(owner.session.authorizeOwner('Pelanggan langganan', '482916', 'harga', 'B-1')).toEqual({
      ok: true,
    });
    expect(owner.session.state().audit.at(-1)).toMatchObject({
      ownerName: 'Bapak Haris',
      reason: 'Pelanggan langganan',
    });
    expect(owner.session.state().activity.at(-1)).toMatchObject({ action: 'Otorisasi harga' });
    expect(owner.session.state().ownerApproved).toBe(false);
    const supervisor = withLine('U-3');
    expect(supervisor.session.authorizeOwner('Diskon proyek', '3571', 'harga', 'B-1')).toEqual({
      ok: true,
    });
    expect(supervisor.session.state().audit.at(-1)).toMatchObject({ ownerName: 'Ibu Sinta' });
    const other = withLine('U-3');
    expect(other.session.authorizeOwner('Diskon proyek', '3571', 'koreksi', 'B-1')).toMatchObject({
      ok: false,
      messageId: 'MSG-050',
    });
    expect(other.session.authorizeOwner('Diskon proyek', '1357', 'harga', 'B-1')).toMatchObject({
      ok: false,
      messageId: 'MSG-050',
    });
  });

  it('catatan dan tenaga penjual tersimpan, divalidasi, dan ikut ke Sale', () => {
    const { session } = withLine('U-3');
    expect(session.setLineDetail(0, { note: '  Antar sore  ', sellerId: 'U-5' })).toEqual({
      ok: true,
    });
    expect(session.state().lines[0]).toMatchObject({ note: 'Antar sore', sellerId: 'U-5' });
    expect(session.setLineDetail(0, { sellerId: 'U-3' })).toEqual({
      ok: false,
      labelKey: 'tenagaPenjualTidakSah',
    });
    expect(session.setLineDetail(0, { sellerId: 'U-404' })).toEqual({
      ok: false,
      labelKey: 'tenagaPenjualTidakSah',
    });
    expect(session.setLineDetail(0, { note: 'x'.repeat(201) })).toEqual({
      ok: false,
      labelKey: 'catatanTerlaluPanjang',
    });
    expect(session.setLineDetail(0, { note: '', sellerId: null })).toEqual({ ok: true });
    expect(session.state().lines[0]?.note).toBeUndefined();
    expect(session.state().lines[0]?.sellerId).toBeUndefined();
    expect(session.setLineDetail(0, { note: 'Antar sore', sellerId: 'U-5' })).toEqual({ ok: true });
    session.startShift(100000);
    session.exactAmount();
    const sale = session.finish();
    expect(sale?.lines[0]).toMatchObject({ note: 'Antar sore', sellerId: 'U-5' });
  });

  it('mengganti satuan atau jumlah menghitung ulang harga dan membuang harga yang diubah', () => {
    const { session, original } = withLine('U-2');
    expect(session.setLineDetail(0, { price: original - 5000, quantity: 3 })).toEqual({ ok: true });
    expect(session.state().lines[0]).toMatchObject({ quantity: 3, listPrice: original });
    const product = first();
    const other = product.units.find((unit) => unit.code !== session.state().lines[0]?.unit);
    if (other === undefined) {
      throw new Error('barang tanpa satuan kedua');
    }
    expect(session.setLineDetail(0, { unit: other.code })).toEqual({ ok: true });
    expect(session.state().lines[0]?.unit).toBe(other.code);
    expect(session.state().lines[0]?.listPrice).toBeUndefined();
    expect(session.setLineDetail(0, { quantity: 0 })).toMatchObject({ ok: false });
    expect(session.setLineDetail(7, { quantity: 1 })).toEqual({
      ok: false,
      labelKey: 'barisTidakAda',
    });
  });

  it('finish menghitung total dari subtotal setelah diskon', () => {
    const { session, original } = withLine('U-2');
    session.startShift(100000);
    session.setLineDetail(0, { discount: { kind: 'persen', value: 10 } });
    const expected = Math.round(2 * original) - Math.round(2 * original * 0.1);
    expect(session.total()).toBe(expected);
    session.exactAmount();
    const sale = session.finish();
    expect(sale?.total).toBe(expected);
    expect(sale?.paid).toBe(expected);
  });
});

describe('split dan merge bill gantung', () => {
  function holdTwo(userId = 'U-3') {
    const harness = setup(userId);
    const [semen, lem] = [dataset.products[0], dataset.products[1]];
    if (semen === undefined || lem === undefined) {
      throw new Error('data kosong');
    }
    harness.session.addProduct(semen, undefined, 4);
    harness.session.addProduct(lem, undefined, 2);
    const held = harness.session.holdBill();
    if (held === undefined) {
      throw new Error('bill tidak tertahan');
    }
    return { ...harness, held };
  }

  it('splitHeldBill menyimpan dua bill dan memberi nomor berikutnya', () => {
    const { session, held } = holdTwo();
    const before = session.state().heldBills.length;
    expect(session.splitHeldBill(held.id, [{ index: 0, quantity: 1 }])).toEqual({ ok: true });
    const bills = session.state().heldBills;
    expect(bills).toHaveLength(before + 1);
    const original = bills.find((bill) => bill.id === held.id);
    const created = bills.at(-1);
    expect(original?.lines[0]?.quantity).toBe(3);
    expect(created?.lines).toHaveLength(1);
    expect(created?.lines[0]?.quantity).toBe(1);
    expect(created?.id).not.toBe(held.id);
    expect(created?.number).toBe(`B-${String(before + 1).padStart(4, '0')}`);
    expect(created?.customerId).toBe(held.customerId);
    expect(session.state().activity.at(-1)?.action).toBe('Split bill');
  });

  it('splitHeldBill menolak pilihan tidak sah dengan labelKey dan bill tidak berubah', () => {
    const { session, held } = holdTwo();
    const before = JSON.stringify(session.state().heldBills);
    expect(session.splitHeldBill(held.id, [])).toEqual({ ok: false, labelKey: 'splitKosong' });
    expect(session.splitHeldBill(held.id, [{ index: 0, quantity: 9 }])).toEqual({
      ok: false,
      labelKey: 'splitMelebihi',
    });
    expect(
      session.splitHeldBill(held.id, [
        { index: 0, quantity: 4 },
        { index: 1, quantity: 2 },
      ]),
    ).toEqual({ ok: false, labelKey: 'splitSemua' });
    expect(session.splitHeldBill('H-404', [{ index: 0, quantity: 1 }])).toMatchObject({
      ok: false,
      messageId: 'MSG-038',
    });
    expect(JSON.stringify(session.state().heldBills)).toBe(before);
  });

  it('mergeHeldBills menjumlahkan ke bill target dan menghapus bill sumber', () => {
    const { session, held } = holdTwo();
    session.splitHeldBill(held.id, [{ index: 0, quantity: 1 }]);
    const source = session.state().heldBills.at(-1);
    if (source === undefined) {
      throw new Error('bill hasil split tidak ada');
    }
    const count = session.state().heldBills.length;
    expect(session.mergeHeldBills(held.id, source.id)).toEqual({ ok: true });
    const bills = session.state().heldBills;
    expect(bills).toHaveLength(count - 1);
    expect(bills.some((bill) => bill.id === source.id)).toBe(false);
    expect(bills.find((bill) => bill.id === held.id)?.lines[0]?.quantity).toBe(4);
    expect(session.state().activity.at(-1)?.action).toBe('Merge bill');
  });

  it('mergeHeldBills menolak sumber sama dengan target dan bill yang tidak ada', () => {
    const { session, held } = holdTwo();
    const before = JSON.stringify(session.state().heldBills);
    expect(session.mergeHeldBills(held.id, held.id)).toEqual({ ok: false, labelKey: 'mergeSama' });
    expect(session.mergeHeldBills(held.id, 'H-404')).toMatchObject({
      ok: false,
      messageId: 'MSG-038',
    });
    expect(session.mergeHeldBills('H-404', held.id)).toMatchObject({
      ok: false,
      messageId: 'MSG-038',
    });
    expect(JSON.stringify(session.state().heldBills)).toBe(before);
  });

  it('split dan merge menjaga diskon, catatan, dan harga yang diubah pada baris', () => {
    const harness = setup('U-2');
    const semen = dataset.products[0];
    if (semen === undefined) {
      throw new Error('data kosong');
    }
    harness.session.addProduct(semen, undefined, 4);
    const original = harness.session.state().lines[0]?.unitPrice ?? 0;
    harness.session.setLineDetail(0, {
      price: original - 1000,
      discount: { kind: 'persen', value: 10 },
      note: 'Antar sore',
    });
    const held = harness.session.holdBill();
    if (held === undefined) {
      throw new Error('bill tidak tertahan');
    }
    harness.session.splitHeldBill(held.id, [{ index: 0, quantity: 1 }]);
    const created = harness.session.state().heldBills.at(-1);
    expect(created?.lines[0]).toMatchObject({
      unitPrice: original - 1000,
      listPrice: original,
      discount: { kind: 'persen', value: 10 },
      note: 'Antar sore',
    });
    expect(harness.session.mergeHeldBills(held.id, created?.id ?? '')).toEqual({ ok: true });
    const merged = harness.session.state().heldBills.find((bill) => bill.id === held.id);
    expect(merged?.lines).toHaveLength(1);
    expect(merged?.lines[0]).toMatchObject({
      quantity: 4,
      unitPrice: original - 1000,
      discount: { kind: 'persen', value: 10 },
    });
  });

  it('mergeHeldBills menolak gabungan lebih dari 200 baris dan kedua bill tetap utuh', () => {
    const { session } = setup('U-2');
    const hold = (items: typeof dataset.products) => {
      for (const product of items) {
        session.addProduct(product, undefined, 1);
      }
      const held = session.holdBill();
      if (held === undefined) {
        throw new Error('bill tidak tertahan');
      }
      return held;
    };
    expect(dataset.products.length).toBeGreaterThanOrEqual(240);
    const first = hold(dataset.products.slice(0, 120));
    const second = hold(dataset.products.slice(120, 240));
    expect(session.mergeHeldBills(first.id, second.id)).toEqual({
      ok: false,
      labelKey: 'mergeTerlaluBanyak',
    });
    const bills = session.state().heldBills;
    expect(bills.find((bill) => bill.id === first.id)?.lines).toHaveLength(120);
    expect(bills.find((bill) => bill.id === second.id)?.lines).toHaveLength(120);
  });

  it('menahan bill setelah bill lain dihapus tidak menggandakan id atau nomor', () => {
    const { session } = setup('U-2');
    const product = dataset.products[0];
    if (product === undefined) {
      throw new Error('data kosong');
    }
    expect(session.deleteHeldBill('H-1')).toEqual({ ok: true });
    session.addProduct(product, undefined, 1);
    const held = session.holdBill();
    const bills = session.state().heldBills;
    expect(new Set(bills.map((bill) => bill.id)).size).toBe(bills.length);
    expect(new Set(bills.map((bill) => bill.number)).size).toBe(bills.length);
    expect(held?.id).toBe('H-4');
    expect(held?.number).toBe('B-0004');
  });
});
