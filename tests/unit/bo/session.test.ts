import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { createBoSession } from '../../../src/apps/bo/bo-session';
import { draftOf, emptyDraft } from '../../../src/apps/bo/domain/product-form';
import { rowsOf } from '../../../src/apps/bo/domain/pricing';

const dataset = generateDataset();

function setup(online = true) {
  const store = createStore({ dataset });
  store.setOnline(online);
  let now = 1_000_000;
  const session = createBoSession(store, { clock: () => now });
  return { store, session, advance: (ms: number) => (now += ms) };
}

function loggedIn(username: string, password: string) {
  const context = setup();
  expect(context.session.login(username, password)).toEqual({ ok: true });
  return context;
}

function first(store: ReturnType<typeof setup>['store']): Product {
  const product = store.getState().data.products[0];
  if (product === undefined) {
    throw new Error('data kosong');
  }
  return product;
}

describe('login BO', () => {
  it('menolak saat offline dan mencatat login ke log aktivitas', () => {
    expect(setup(false).session.login('sinta.spv', 'Kunci2026B')).toMatchObject({
      ok: false,
      messageId: 'MSG-001',
    });
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const entry = store.getState().activity.at(-1);
    expect(entry).toMatchObject({ kind: 'masuk', userId: 'U-2', device: 'Back-Office PC' });
    expect(entry?.at).toMatch(/^2026-10-19T03:00:00/);
    expect(session.state().user?.username).toBe('sinta.spv');
    expect(store.getState().role).toBe('supervisor');
  });

  it('mengunci akun setelah lima kegagalan dan membukanya setelah 15 menit', () => {
    const { session, advance } = setup();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      session.login('sinta.spv', 'salah');
    }
    expect(session.login('sinta.spv', 'Kunci2026B')).toMatchObject({ messageId: 'MSG-055' });
    advance(15 * 60 * 1000);
    expect(session.login('sinta.spv', 'Kunci2026B')).toEqual({ ok: true });
  });
});

describe('barang dan harga', () => {
  it('menyimpan barang baru dan mencatat log; menolak kode ganda', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const draft = { ...emptyDraft(), code: 'B9001', name: 'Barang Uji', baseUnit: 'Pcs' };
    const saved = session.saveProduct(draft, undefined);
    expect(saved).toMatchObject({ ok: true });
    expect(store.getState().data.products).toHaveLength(3601);
    expect(store.getState().data.products.at(-1)?.code).toBe('B9001');
    expect(session.saveProduct(draft, undefined)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-059' },
    });
  });

  it('mengubah barang tanpa menghapus stok dan menonaktifkan hanya oleh Owner', () => {
    const supervisor = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(supervisor.store);
    const edited = supervisor.session.saveProduct(
      { ...draftOf(target), name: 'Nama Diubah' },
      target.id,
    );
    expect(edited).toMatchObject({ ok: true });
    expect(first(supervisor.store).name).toBe('Nama Diubah');
    expect(first(supervisor.store).stock).toEqual(target.stock);
    expect(supervisor.session.deactivateProduct(target.id)).toMatchObject({
      ok: false,
      messageId: 'MSG-003',
    });
    const owner = loggedIn('haris.owner', 'Kunci2026A');
    expect(owner.session.deactivateProduct(first(owner.store).id)).toEqual({ ok: true });
    expect(first(owner.store).active).toBe(false);
  });

  it('menyimpan harga hanya untuk Owner, dengan konfirmasi di bawah HPP dan log sebelum sesudah', () => {
    const supervisor = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(supervisor.store);
    expect(supervisor.session.savePricing(target.id, rowsOf(target), false)).toMatchObject({
      ok: false,
      kind: 'denied',
    });
    const { store, session } = loggedIn('haris.owner', 'Kunci2026A');
    const rows = rowsOf(first(store)).map((row, index) =>
      index === 0 ? { ...row, eceran: '100', grosir: '90' } : row,
    );
    const asked = session.savePricing(first(store).id, rows, false);
    expect(asked).toMatchObject({ ok: false, kind: 'confirm', rows: [0] });
    expect(session.savePricing(first(store).id, rows, true)).toEqual({ ok: true });
    expect(first(store).prices['Kg']).toEqual({ eceran: 100, grosir: 90 });
    const entry = store.getState().activity.at(-1);
    expect(entry?.kind).toBe('harga');
    expect(entry?.detail).toContain('Kg eceran');
  });
});

describe('stok, mutasi, dan opname', () => {
  it('menolak tanda ditinjau saat stok masih negatif dan menerimanya setelah diperbaiki', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    store.setStock(target.id, { display: -2, besar: 0 });
    expect(store.getState().negativeReview).toContain(target.id);
    expect(session.markReviewed(target.id)).toMatchObject({ ok: false, messageId: 'MSG-070' });
    store.setStock(target.id, { display: 5, besar: 0 });
    expect(session.markReviewed(target.id)).toEqual({ ok: true });
    expect(store.getState().negativeReview).not.toContain(target.id);
  });

  it('memindahkan stok antar gudang, menomori M-0002, dan mencatat log (F-06)', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    const before = target.stock;
    const result = session.saveTransfer('besar', 'display', [
      { productId: target.id, unit: 'Sak', quantity: '2' },
    ]);
    expect(result).toEqual({ ok: true, number: 'M-0002' });
    const after = first(store).stock;
    expect(after.besar).toBeCloseTo(before.besar - 80, 3);
    expect(after.display).toBeCloseTo(before.display + 80, 3);
    expect(session.state().transfers.at(-1)?.number).toBe('M-0002');
    expect(store.getState().activity.at(-1)).toMatchObject({ kind: 'mutasi' });
    expect(store.getState().activity.at(-1)?.detail).toContain('M-0002');
  });

  it('tidak mengubah stok bila validasi mutasi gagal', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    const result = session.saveTransfer('besar', 'display', [
      { productId: target.id, unit: 'Sak', quantity: '999999' },
    ]);
    expect(result).toMatchObject({ ok: false, messageId: 'MSG-072', line: 0 });
    expect(first(store).stock).toEqual(target.stock);
    expect(session.state().transfers).toHaveLength(1);
  });

  it('menjalankan opname dua tahap: perintah, hitung, selesai oleh Supervisor, jurnal selisih, tidak dapat diubah (A-13)', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    expect(session.saveOpnameOrder(undefined)).toEqual({ ok: false, empty: true });
    expect(session.addOpnameProducts(undefined, [target])).toBe(1);
    expect(session.addOpnameProducts(undefined, [target])).toBe(0);
    const saved = session.saveOpnameOrder(undefined);
    expect(saved).toMatchObject({ ok: true, pso: 'PSO-0005', status: 'menunggu' });
    expect(session.startOpnameCount('PSO-0005')).toMatchObject({ ok: true, status: 'perhitungan' });
    const started = session.state().opnameOrders.find((order) => order.pso === 'PSO-0005');
    expect(started).toMatchObject({ hso: 'HSO-0004', status: 'perhitungan' });
    expect(session.saveOpnameResult('PSO-0005')).toMatchObject({ messageId: 'MSG-074' });
    session.setPhysical('PSO-0005', target.id, '-1');
    expect(session.saveOpnameResult('PSO-0005')).toMatchObject({ messageId: 'MSG-075' });
    session.setPhysical('PSO-0005', target.id, String(target.stock.display - 1).replace('.', ','));
    expect(session.saveOpnameResult('PSO-0005')).toMatchObject({ ok: true, status: 'selesai' });
    expect(first(store).stock.display).toBeCloseTo(target.stock.display - 1, 3);
    const doc = session.state().opnameOrders.find((order) => order.pso === 'PSO-0005');
    expect(doc?.status).toBe('selesai');
    expect(doc?.appliedBy).toBe('U-2');
    expect(doc?.journalValue).toBe(Math.round(-1 * target.hpp));
    expect(store.getState().activity.at(-1)?.kind).toBe('opname');
    expect(session.saveOpnameResult('PSO-0005')).toMatchObject({ messageId: 'MSG-077' });
    session.setPhysical('PSO-0005', target.id, '99');
    expect(
      session.state().opnameOrders.find((order) => order.pso === 'PSO-0005')?.lines[0]?.physical,
    ).not.toBe('99');
    expect(session.state().opnameDraft.pso).toBe('PSO-0006');
  });

  it('menyimpan hasil sebagian sebagai Dalam Perhitungan tanpa mengubah stok', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const products = store.getState().data.products.slice(40, 42);
    session.addOpnameProducts(undefined, products);
    session.saveOpnameOrder(undefined);
    const before = products.map((item) => item.stock.display);
    const [one, two] = products;
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    session.setPhysical('PSO-0005', one?.id ?? '', '1');
    expect(session.saveOpnameResult('PSO-0005')).toMatchObject({ ok: true, status: 'perhitungan' });
    expect(session.state().opnameOrders.at(-1)).toMatchObject({
      hso: 'HSO-0004',
      status: 'perhitungan',
    });
    expect(
      store
        .getState()
        .data.products.slice(40, 42)
        .map((item) => item.stock.display),
    ).toEqual(before);
  });

  it('menyimpan keterangan dan pengguna pada mutasi; benih M-0001 berketerangan (gambar 14 dan 15)', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    expect(session.state().transfers[0]).toMatchObject({ number: 'M-0001', note: 'Isi stok toko' });
    const line = { productId: target.id, unit: 'Sak', quantity: '1' };
    session.saveTransfer('besar', 'display', [line], '  Buat dibawa besok pagi ');
    expect(session.state().transfers.at(-1)).toMatchObject({
      number: 'M-0002',
      note: 'Buat dibawa besok pagi',
      userId: 'U-2',
    });
    session.saveTransfer('besar', 'display', [line]);
    expect(session.state().transfers.at(-1)?.note).toBe('');
  });

  it('memuat empat perintah contoh pada riwayat opname dan memulihkannya saat reset', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    expect(session.state().opnameOrders.map((doc) => [doc.pso, doc.hso, doc.status])).toEqual([
      ['PSO-0001', 'HSO-0001', 'selesai'],
      ['PSO-0002', 'HSO-0002', 'selesai'],
      ['PSO-0003', 'HSO-0003', 'perhitungan'],
      ['PSO-0004', undefined, 'menunggu'],
    ]);
    expect(session.state().opnameDraft.pso).toBe('PSO-0005');
    session.addOpnameProducts(undefined, [target]);
    session.saveOpnameOrder(undefined);
    expect(session.state().opnameOrders).toHaveLength(5);
    store.resetData();
    expect(session.state().opnameOrders).toHaveLength(4);
    expect(session.state().opnameDraft.pso).toBe('PSO-0005');
  });

  it('removeOpnameOrder hanya menghapus perintah yang masih menunggu eksekusi', () => {
    const { session } = loggedIn('sinta.spv', 'Kunci2026B');
    const states = session.state().opnameOrders.map((order) => [order.pso, order.status]);
    expect(states).toContainEqual(['PSO-0004', 'menunggu']);
    expect(session.removeOpnameOrder('PSO-0002')).toBe(false);
    expect(session.removeOpnameOrder('PSO-0003')).toBe(false);
    expect(session.removeOpnameOrder('PSO-9999')).toBe(false);
    expect(session.state().opnameOrders).toHaveLength(4);
    expect(session.removeOpnameOrder('PSO-0004')).toBe(true);
    expect(session.state().opnameOrders.map((order) => order.pso)).not.toContain('PSO-0004');
    expect(session.state().opnameOrders).toHaveLength(3);
  });

  it('mengubah kepala perintah, menambah dan menghapus baris selama belum dihitung', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const [one, two] = store.getState().data.products;
    session.addOpnameProducts(undefined, [one ?? first(store), two ?? first(store)]);
    expect(session.state().opnameDraft.lines).toHaveLength(2);
    session.removeOpnameLine(undefined, (one ?? first(store)).id);
    expect(session.state().opnameDraft.lines).toHaveLength(1);
    session.editOpname(undefined, { warehouse: 'besar', note: 'Cek rak', officerId: 'U-3' });
    expect(session.state().opnameDraft).toMatchObject({
      warehouse: 'besar',
      note: 'Cek rak',
      officerId: 'U-3',
    });
    session.saveOpnameOrder(undefined);
    session.startOpnameCount('PSO-0005');
    session.editOpname('PSO-0005', { warehouse: 'display' });
    expect(session.state().opnameOrders.at(-1)?.warehouse).toBe('besar');
    expect(session.addOpnameProducts('PSO-0005', [first(store)])).toBe(0);
  });

  it('mengatur ulang dokumen BO saat data diatur ulang', () => {
    const { store, session } = loggedIn('sinta.spv', 'Kunci2026B');
    const target = first(store);
    session.saveTransfer('besar', 'display', [
      { productId: target.id, unit: 'Sak', quantity: '1' },
    ]);
    store.resetData();
    expect(session.state().transfers).toHaveLength(1);
    expect(session.state().opnameDraft.lines).toHaveLength(0);
  });
});
