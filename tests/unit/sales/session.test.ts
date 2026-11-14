import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import { createMemoryVault } from '../../../src/apps/sales/domain/auth';
import { SESSION_DAYS } from '../../../src/apps/sales/domain/constants';
import { createSalesSession } from '../../../src/apps/sales/sales-session';
import { createOwnerSession } from '../../../src/apps/owner/owner-session';
import { canOpenScreen, isAllowed, screensFor } from '../../../src/shared/permissions';
import { lateCustomer, need } from '../owner/support';
import { setup } from './support';

describe('sesi Sales Lapangan', () => {
  it('mencatat login, menyimpan sesi 30 hari, dan memulihkannya', () => {
    const dataset = generateDataset();
    const vault = createMemoryVault();
    let now = 1_000_000;
    const store = createStore({ dataset });
    const first = createSalesSession(store, { clock: () => now, vault });
    expect(first.login('budi.sales', 'Kunci2026F')).toEqual({ ok: true });
    expect(first.userName()).toBe('Budi Lapangan');
    expect(store.getState().activity.at(-1)).toMatchObject({
      kind: 'masuk',
      userId: 'U-6',
      device: 'HP Sales (aplikasi mobile)',
    });
    expect(vault.read()?.expiresAt).toBe(1_000_000 + SESSION_DAYS * 24 * 60 * 60 * 1000);
    now += 10 * 24 * 60 * 60 * 1000;
    const restored = createSalesSession(createStore({ dataset }), { clock: () => now, vault });
    expect(restored.signedIn()).toBe(true);
    restored.logout();
    expect(vault.read()).toBeUndefined();
    expect(vault.known()).toEqual(['U-6']);
    vault.write({ userId: 'U-6', expiresAt: now - 1 });
    const expired = createSalesSession(createStore({ dataset }), { clock: () => now, vault });
    expect(expired.signedIn()).toBe(false);
    expect(vault.read()).toBeUndefined();
  });

  it('menolak masuk pertama saat offline dan menerima perangkat yang dikenal', () => {
    const first = setup({ online: false, signedIn: false });
    expect(first.session.login('budi.sales', 'Kunci2026F')).toEqual({
      ok: false,
      labelKey: 'masukPertamaButuhInternet',
    });
    const known = setup({ signedIn: true });
    known.session.logout();
    known.store.setOnline(false);
    expect(known.session.login('budi.sales', 'Kunci2026F')).toEqual({ ok: true });
  });

  it('memulihkan pengguna Sales ke store setelah aplikasi lain mengganti peran', () => {
    const { session, store } = setup();
    store.setRole('owner');
    expect(store.getState().role).toBe('owner');
    session.activate();
    expect(store.getState().role).toBe('sales');
    expect(store.getState().userId).toBe('U-6');
  });

  it('membatasi layar dan aksi pada peran Sales', () => {
    expect(screensFor('sales')).toEqual([
      'SALES-01',
      'SALES-02',
      'SALES-03',
      'SALES-04',
      'SALES-05',
    ]);
    expect(canOpenScreen('owner', 'SALES-02')).toBe(false);
    expect(canOpenScreen('sales', 'POS-02')).toBe(false);
    expect(canOpenScreen('sales', 'BO-03')).toBe(false);
    expect(canOpenScreen('sales', 'OWN-02')).toBe(false);
    expect(isAllowed('sales', 'SALES-03', 'Simpan Sales Order')).toBe(true);
    expect(isAllowed('kasir', 'SALES-03', 'Simpan Sales Order')).toBe(false);
    expect(isAllowed('sales', 'OWN-06', 'Setujui')).toBe(false);
    const { session, store } = setup();
    store.setRole('kasir');
    expect(session.saveOrder()).toEqual({ ok: false, labelKey: 'hanyaSales' });
  });
});

describe('draf dan Sales Order', () => {
  it('menggabungkan barang yang sama dan menyimpan Draf bernomor SO dengan sumber sales', () => {
    const { session, store, product } = setup();
    session.addLine(product, 'Sak');
    session.addLine(product, 'Sak', '2');
    expect(session.state().draft.lines).toEqual([
      { productId: product.id, unit: 'Sak', quantity: '3' },
    ]);
    const result = session.saveOrder();
    expect(result).toEqual({ ok: true, number: 'SO-0001', approval: false });
    const order = need(store.getState().salesOrders[0]);
    expect(order).toMatchObject({
      status: 'draf',
      source: 'sales',
      createdBy: 'U-6',
      payment: 'tunai',
      approvalId: undefined,
    });
    expect(session.state().draft.lines).toEqual([]);
    expect(session.orders()).toHaveLength(1);
    expect(store.getState().activity.at(-1)?.detail).toContain('SO-0001 Draf');
  });

  it('menolak order kosong dan jumlah tidak valid dengan pesan Lampiran C', () => {
    const { session, product } = setup();
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-025' });
    session.addLine(product, 'Sak', '0');
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-029', line: 0 });
    session.clearDraft();
    session.setDraft({ payment: 'dp' });
    session.addLine(product, 'Sak');
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-034' });
    session.setDraft({ customerId: 'C-001', downPayment: '' });
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-029' });
    session.setDraft({ customerId: '', payment: 'piutang' });
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-034' });
  });

  it('memakai harga tier pelanggan pada total order', () => {
    const { session, store, product } = setup();
    session.setDraft({ customerId: 'C-001' });
    session.addLine(product, 'Sak');
    expect(session.tier()).toBe(
      need(store.getState().data.customers.find((item) => item.id === 'C-001')).tier,
    );
    session.setCatalogTier('grosir');
    session.setDraft({ customerId: '' });
    expect(session.tier()).toBe('grosir');
  });

  it('meminta persetujuan Owner bila piutang melebihi limit dan menyimpan SO sebagai Draf terkait', () => {
    const { session, store, product } = setup();
    session.setDraft({ customerId: 'C-003', payment: 'piutang' });
    session.addLine(product, 'Sak', '5000');
    const warned = session.saveOrder();
    expect(warned).toMatchObject({ ok: false, warning: { reason: 'over-limit' } });
    expect(store.getState().salesOrders).toHaveLength(0);
    const saved = session.saveOrder({ requestApproval: true });
    expect(saved).toEqual({ ok: true, number: 'SO-0001', approval: true });
    const request = need(store.getState().approvals.at(-1));
    expect(request).toMatchObject({
      id: 'AP-4',
      kind: 'piutang',
      status: 'menunggu',
      reference: 'SO-0001',
      requestedBy: 'U-6',
      customerId: 'C-003',
    });
    expect(need(store.getState().salesOrders[0]).approvalId).toBe('AP-4');
    expect(session.approvalOf(need(session.orders()[0])).status).toBe('menunggu');
    expect(
      store
        .getState()
        .activity.some((item) => item.detail.startsWith('Permintaan persetujuan Owner')),
    ).toBe(true);
  });

  it('memperingatkan piutang terlambat dan meneruskan keputusan Owner dari aplikasi Owner', () => {
    const { session, store, dataset, product } = setup();
    const customer = { ...lateCustomer(dataset, 12), limit: 900_000_000 };
    store.addCustomer(customer);
    session.setDraft({ customerId: customer.id, payment: 'piutang' });
    session.addLine(product, 'Sak');
    const warned = session.saveOrder();
    expect(warned).toMatchObject({ ok: false, warning: { reason: 'overdue' } });
    session.saveOrder({ requestApproval: true });
    const order = need(session.orders()[0]);
    const owner = createOwnerSession(store, {
      schedule: (run) => {
        run();
      },
    });
    expect(owner.login('haris.owner', 'Kunci2026A')).toEqual({ ok: true });
    expect(store.getState().approvals).toHaveLength(4);
    expect(owner.decide('AP-4', 'ditolak', 'Belum lunas', '482916')).toEqual({ ok: true });
    session.activate();
    expect(session.approvalOf(order).status).toBe('ditolak');
    expect(session.sendCopy(order.number, '081234567890')).toEqual({
      ok: false,
      labelKey: 'soDitolakOwner',
    });
  });
});

describe('salinan SO, WhatsApp, dan printer', () => {
  it('menolak kirim bila persetujuan menunggu atau nomor tidak valid, lalu mencatat pengiriman', () => {
    const { session, store, product } = setup();
    session.setDraft({ customerId: 'C-003', payment: 'piutang' });
    session.addLine(product, 'Sak', '5000');
    session.saveOrder({ requestApproval: true });
    expect(session.sendCopy('SO-0001', '081234567890')).toEqual({
      ok: false,
      labelKey: 'tungguPersetujuan',
    });
    store.resolveApproval('AP-4', 'disetujui', 'U-1', '2026-10-19T03:05:00.000Z', 'Pelanggan lama');
    expect(session.sendCopy('SO-0001', '12')).toMatchObject({ ok: false, messageId: 'MSG-044' });
    expect(session.sendCopy('SO-0001', '0812 3456 7890')).toEqual({ ok: true, queued: false });
    const entry = need(store.getState().activity.at(-1));
    expect(entry).toMatchObject({ kind: 'cetak', device: 'HP Sales (aplikasi mobile)' });
    expect(entry.detail).toBe('Salinan SO SO-0001 (PDF) dikirim ke 081234567890 via WA (simulasi)');
    expect(session.state().sent['SO-0001']).toBeDefined();
    expect(session.sendCopy('SO-9999', '081234567890')).toEqual({
      ok: false,
      labelKey: 'hanyaSales',
    });
  });

  it('mengantrekan order dan salinan saat offline lalu mengirimnya saat online kembali', () => {
    const { session, store, product } = setup({ online: false });
    session.addLine(product, 'Sak');
    expect(session.saveOrder()).toMatchObject({ ok: true });
    expect(session.sendCopy('SO-0001', '081234567890')).toEqual({ ok: true, queued: true });
    expect(session.pending()).toBe(2);
    expect(store.getState().activity.at(-1)?.detail).toContain('menunggu sinkron');
    store.setOnline(true);
    expect(session.pending()).toBe(0);
    expect(session.state().syncing).toBe(false);
    expect(session.state().queue.every((item) => item.status === 'terkirim')).toBe(true);
  });

  it('mencetak ke printer Bluetooth simulasi hanya setelah printer dipilih', () => {
    const { session, store, product } = setup();
    session.addLine(product, 'Sak');
    session.saveOrder();
    expect(session.printCopy('SO-0001')).toEqual({ ok: false, labelKey: 'pilihPrinterDulu' });
    session.setPrinter(session.printers[0]);
    expect(session.printCopy('SO-0001')).toEqual({ ok: true, printer: 'Printer BT-58' });
    expect(store.getState().activity.at(-1)?.detail).toBe(
      'Salinan SO SO-0001 dicetak ke Printer BT-58 (simulasi)',
    );
  });

  it('mengosongkan draf dan antrean saat data diatur ulang', () => {
    const { session, store, product } = setup({ online: false });
    session.addLine(product, 'Sak');
    session.saveOrder();
    session.addLine(product, 'Sak');
    expect(session.pending()).toBe(1);
    store.resetData();
    expect(session.state().queue).toEqual([]);
    expect(session.state().draft.lines).toEqual([]);
    expect(store.getState().salesOrders).toEqual([]);
  });
});
