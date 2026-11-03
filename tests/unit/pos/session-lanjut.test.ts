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
    expect(session.saveExpense('parkir', '', 0)).toMatchObject({ messageId: 'MSG-029' });
    expect(session.saveExpense('lainnya', ' ', 5000)).toMatchObject({ messageId: 'MSG-042' });
    expect(session.saveExpense('parkir', '', 2000000)).toMatchObject({
      messageId: 'MSG-041',
      values: { saldo: 'Rp 1.337.000' },
    });
  });

  it('mengurangi saldo kas dan mencatat biaya', () => {
    const { session } = setup();
    expect(session.cashBalance()).toBe(1337000);
    expect(session.saveExpense('parkir', '', 5000)).toEqual({ ok: true });
    expect(session.cashBalance()).toBe(1332000);
    expect(session.state().expenses).toHaveLength(1);
    expect(session.saveExpense('bensin', '', 1332000)).toEqual({ ok: true });
    expect(session.saveExpense('bensin', '', 1)).toMatchObject({ messageId: 'MSG-041' });
  });

  it('memasukkan biaya ke antrean hanya saat offline', () => {
    const online = setup('U-3', true);
    online.session.saveExpense('parkir', '', 5000);
    expect(online.session.pendingQueue()).toBe(3);
    const offline = setup('U-3', false);
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

  it('melarang Kasir meretur', () => {
    const { session } = setup('U-3');
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
