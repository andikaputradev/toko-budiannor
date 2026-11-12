import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import { createMemoryVault } from '../../../src/apps/owner/domain/auth';
import { SESSION_DAYS } from '../../../src/apps/owner/domain/constants';
import { createOwnerSession } from '../../../src/apps/owner/owner-session';
import { lateCustomer, need, setup } from './support';

describe('sesi aplikasi Owner', () => {
  it('menolak masuk saat offline dan peran non-Owner, lalu mencatat login Owner', () => {
    const offline = setup({ online: false, signedIn: false });
    expect(offline.session.login('haris.owner', 'Kunci2026A')).toEqual({
      ok: false,
      labelKey: 'masukButuhInternet',
    });
    const online = setup({ signedIn: false });
    expect(online.session.login('sinta.spv', 'Kunci2026B')).toMatchObject({
      ok: false,
      messageId: 'MSG-118',
    });
    expect(online.session.signedIn()).toBe(false);
    expect(online.session.login('haris.owner', 'Kunci2026A')).toEqual({ ok: true });
    expect(online.session.signedIn()).toBe(true);
    const entry = online.store.getState().activity.at(-1);
    expect(entry).toMatchObject({
      kind: 'masuk',
      userId: 'U-1',
      device: 'HP Owner (aplikasi mobile)',
    });
  });

  it('menyimpan sesi 30 hari dan memulihkannya pada HP yang sama sampai Owner keluar', () => {
    const dataset = generateDataset();
    const vault = createMemoryVault();
    let now = 1_000_000;
    const first = createOwnerSession(createStore({ dataset }), { clock: () => now, vault });
    first.login('haris.owner', 'Kunci2026A');
    expect(vault.read()?.expiresAt).toBe(1_000_000 + SESSION_DAYS * 24 * 60 * 60 * 1000);
    now += 29 * 24 * 60 * 60 * 1000;
    const restored = createOwnerSession(createStore({ dataset }), { clock: () => now, vault });
    expect(restored.signedIn()).toBe(true);
    restored.logout();
    expect(vault.read()).toBeUndefined();
    const again = createOwnerSession(createStore({ dataset }), { clock: () => now, vault });
    expect(again.signedIn()).toBe(false);
    vault.write({ userId: 'U-1', expiresAt: now - 1 });
    const expired = createOwnerSession(createStore({ dataset }), { clock: () => now, vault });
    expect(expired.signedIn()).toBe(false);
    expect(vault.read()).toBeUndefined();
  });

  it('memuat ulang data saat online dan gagal dengan MSG-119 saat offline', () => {
    const { session, store, advance } = setup();
    const before = session.state().loadedAt;
    advance(120_000);
    expect(session.refresh()).toEqual({ ok: true });
    expect(session.state().loadedAt).not.toBe(before);
    const loaded = session.loadedText();
    store.setOnline(false);
    const failed = session.refresh();
    expect(failed).toEqual({ ok: false, messageId: 'MSG-119', values: { jam: loaded } });
    expect(session.loadedText()).toBe(loaded);
  });
});

describe('persetujuan', () => {
  it('menyetujui dengan PIN Owner, mencatat log otorisasi, dan hanya sekali per permintaan', () => {
    const { session, store } = setup();
    expect(session.decide('AP-1', 'disetujui', 'abc', '482916')).toMatchObject({
      messageId: 'MSG-048',
    });
    expect(session.decide('AP-1', 'disetujui', 'Pelanggan lama', '654321')).toMatchObject({
      messageId: 'MSG-050',
    });
    expect(session.decide('AP-1', 'disetujui', 'Pelanggan lama', '482916')).toEqual({ ok: true });
    const request = need(store.getState().approvals.find((item) => item.id === 'AP-1'));
    expect(request).toMatchObject({
      status: 'disetujui',
      decidedBy: 'U-1',
      note: 'Pelanggan lama',
    });
    expect(store.getState().activity.at(-1)).toMatchObject({ kind: 'otorisasi' });
    expect(store.getState().activity.at(-1)?.detail).toContain('B-0002 diskon disetujui');
    expect(session.decide('AP-1', 'ditolak', 'Pelanggan lama', '482916')).toMatchObject({
      ok: false,
    });
  });

  it('menolak dengan PIN Owner dan mengunci setelah tiga PIN salah', () => {
    const { session, store } = setup();
    expect(session.decide('AP-3', 'ditolak', 'Tidak sesuai', '482916')).toEqual({ ok: true });
    expect(need(store.getState().approvals.find((item) => item.id === 'AP-3')).status).toBe(
      'ditolak',
    );
    session.decide('AP-2', 'disetujui', 'Pelanggan lama', '111111');
    session.decide('AP-2', 'disetujui', 'Pelanggan lama', '222222');
    expect(session.decide('AP-2', 'disetujui', 'Pelanggan lama', '333333')).toMatchObject({
      messageId: 'MSG-051',
    });
  });

  it('menolak aksi bila peran bukan Owner', () => {
    const { session, store } = setup();
    store.setRole('supervisor');
    expect(session.decide('AP-1', 'disetujui', 'Pelanggan lama', '482916')).toMatchObject({
      messageId: 'MSG-118',
    });
    expect(session.allowed('OWN-06', 'Setujui')).toBe(false);
  });
});

describe('dokumen dari HP', () => {
  it('membuat mutasi bernomor lanjutan dari store dan memindahkan stok', () => {
    const { session, store } = setup();
    const product = need(store.getState().data.products[0]);
    const result = session.saveTransfer(product.id, 'besar', 'display', 'Sak', '2');
    expect(result).toEqual({ ok: true, number: 'M-0002' });
    const after = need(store.getState().data.products[0]).stock;
    expect(after.besar).toBeCloseTo(product.stock.besar - 80, 3);
    expect(after.display).toBeCloseTo(product.stock.display + 80, 3);
    expect(store.getState().activity.at(-1)?.kind).toBe('mutasi');
    expect(store.peekNumber('M')).toBe('M-0003');
    expect(session.saveTransfer(product.id, 'besar', 'besar', 'Sak', '1')).toMatchObject({
      messageId: 'MSG-071',
    });
    expect(session.saveTransfer(product.id, 'besar', 'display', 'Sak', '999999')).toMatchObject({
      messageId: 'MSG-072',
    });
  });

  it('menyimpan Sales Order sebagai Draf dan meminta persetujuan untuk piutang over-limit', () => {
    const { session, store, dataset } = setup();
    const product = need(dataset.products[0]);
    const draft = {
      customerId: 'C-003',
      lines: [{ productId: product.id, unit: 'Sak', quantity: '5000' }],
      payment: 'piutang' as const,
      downPayment: '',
    };
    const asked = session.saveSalesOrder(draft);
    expect(asked).toMatchObject({ ok: false, approval: 'MSG-035' });
    expect(
      session.saveSalesOrder(draft, { reason: 'Pelanggan lama', pin: '111111' }),
    ).toMatchObject({
      messageId: 'MSG-049',
    });
    const saved = session.saveSalesOrder(draft, { reason: 'Pelanggan lama', pin: '482916' });
    expect(saved).toEqual({ ok: true, number: 'SO-0001' });
    expect(store.getState().salesOrders[0]).toMatchObject({ status: 'draf', source: 'owner' });
    const cash = session.saveSalesOrder({
      ...draft,
      customerId: '',
      payment: 'tunai',
      lines: [{ productId: product.id, unit: 'Sak', quantity: '1' }],
    });
    expect(cash).toEqual({ ok: true, number: 'SO-0002' });
  });

  it('menyimpan Purchase Order darurat dengan status Dipesan', () => {
    const { session, store, dataset } = setup();
    const product = need(dataset.products[1]);
    const result = session.savePurchaseOrder({
      supplierId: 'V-002',
      warehouse: 'besar',
      lines: [
        { productId: product.id, unit: product.baseUnit, quantity: '3', unitPrice: '12.500' },
      ],
    });
    expect(result).toEqual({ ok: true, number: 'PO-0001' });
    expect(store.getState().purchaseOrders[0]).toMatchObject({
      status: 'dipesan',
      total: 37_500,
      supplierId: 'V-002',
    });
    expect(
      session.savePurchaseOrder({ supplierId: '', warehouse: 'besar', lines: [] }),
    ).toMatchObject({
      messageId: 'MSG-078',
    });
  });

  it('mencatat bayar piutang ke invoice tertua dan mengurangi saldo pelanggan', () => {
    const { session, store, dataset } = setup();
    const customer = lateCustomer(dataset, 12);
    store.addCustomer(customer);
    expect(session.recordPayment(customer.id, '0', 'tunai')).toMatchObject({
      messageId: 'MSG-029',
    });
    expect(session.recordPayment(customer.id, '2.000.000', 'tunai')).toMatchObject({
      messageId: 'MSG-087',
    });
    const result = session.recordPayment(customer.id, '400.000', 'transfer');
    expect(result).toEqual({ ok: true, amount: 400_000, remaining: 600_000 });
    const saved = need(store.getState().data.customers.find((item) => item.id === customer.id));
    expect(saved.invoices[0]?.paid).toBe(400_000);
    expect(store.getState().activity.at(-1)?.detail).toContain(
      'Pembayaran piutang C0900 Rp 400.000 (transfer)',
    );
  });
});

describe('offline-first dan notifikasi', () => {
  it('mengantrekan aksi saat offline lalu mengirimkannya otomatis saat online kembali', () => {
    const { session, store } = setup({ online: false });
    expect(session.decide('AP-1', 'disetujui', 'Pelanggan lama', '482916')).toEqual({ ok: true });
    session.sendBill('C-003');
    expect(session.pending()).toBe(2);
    expect(session.state().queue.map((item) => item.status)).toEqual(['menunggu', 'menunggu']);
    expect(
      store
        .getState()
        .activity.some((item) => item.detail.includes('offline, ditinjau saat sinkron')),
    ).toBe(true);
    store.setOnline(true);
    expect(session.pending()).toBe(0);
    expect(session.state().queue.every((item) => item.status === 'terkirim')).toBe(true);
    expect(session.state().syncing).toBe(false);
  });

  it('tidak mengantrekan saat online dan melaporkan tagihan WA terkirim', () => {
    const { session } = setup();
    expect(session.sendBill('C-003')).toEqual({ ok: true, queued: false });
    expect(session.pending()).toBe(0);
  });

  it('menyiapkan notifikasi awal, memicu push simulasi, dan menandai dibaca', () => {
    const { session } = setup();
    const initial = session.state().notifications;
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every((item) => !item.read)).toBe(true);
    const pushed = session.simulatePush('stok');
    expect(pushed?.kind).toBe('stok');
    expect(session.state().push?.id).toBe(pushed?.id);
    expect(session.state().notifications[0]?.id).toBe(pushed?.id);
    session.dismissPush();
    expect(session.state().push).toBeUndefined();
    session.markAllRead();
    expect(session.state().notifications.every((item) => item.read)).toBe(true);
  });

  it('mengosongkan antrean dan memuat ulang notifikasi saat data diatur ulang', () => {
    const { session, store } = setup({ online: false });
    session.decide('AP-1', 'disetujui', 'Pelanggan lama', '482916');
    expect(session.state().queue).toHaveLength(1);
    store.resetData();
    expect(session.state().queue).toEqual([]);
    expect(store.getState().approvals.every((item) => item.status === 'menunggu')).toBe(true);
  });
});
