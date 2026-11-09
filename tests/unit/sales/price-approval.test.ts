import { describe, expect, it } from 'vitest';
import { unitPrice } from '../../../src/shared/data/units';
import { lateCustomer, need } from '../owner/support';
import { setup } from './support';

describe('harga SO di bawah harga tier', () => {
  it('menahan simpan dan meminta persetujuan Owner bila harga di bawah tier', () => {
    const { session, store, product } = setup();
    const list = unitPrice(product, 'Sak', 'eceran');
    session.addLine(product, 'Sak', '2');
    session.setDraft({
      lines: [{ ...need(session.state().draft.lines[0]), price: String(list - 1000) }],
    });
    const warned = session.saveOrder();
    expect(warned).toMatchObject({
      ok: false,
      warning: { reason: 'below-list', kind: 'diskon' },
    });
    expect(store.getState().salesOrders).toHaveLength(0);
    expect(store.getState().approvals).toHaveLength(3);
  });

  it('menyimpan SO sebagai Draf terkait persetujuan jenis diskon dan mencatat log aktivitas', () => {
    const { session, store, product } = setup();
    const list = unitPrice(product, 'Sak', 'eceran');
    session.addLine(product, 'Sak', '2');
    session.setDraft({
      lines: [{ ...need(session.state().draft.lines[0]), price: String(list - 1000) }],
    });
    const saved = session.saveOrder({ requestApproval: true });
    expect(saved).toEqual({ ok: true, number: 'SO-0001', approval: true });
    const request = need(store.getState().approvals.at(-1));
    expect(request).toMatchObject({
      kind: 'diskon',
      status: 'menunggu',
      reference: 'SO-0001',
      requestedBy: 'U-6',
      amount: (list - 1000) * 2,
    });
    expect(request.detail).toContain(product.name);
    expect(request.detail).toContain('Butuh Approval Owner.');
    const order = need(store.getState().salesOrders[0]);
    expect(order.approvalId).toBe(request.id);
    expect(order.lines[0]).toMatchObject({ unitPrice: list - 1000, listPrice: list });
    expect(
      store
        .getState()
        .activity.some(
          (item) => item.kind === 'otorisasi' && item.detail.includes('Permintaan persetujuan'),
        ),
    ).toBe(true);
    expect(session.approvalOf(need(session.orders()[0])).status).toBe('menunggu');
  });

  it('menyimpan langsung bila harga ubah sama dengan atau di atas harga tier', () => {
    const { session, store, product } = setup();
    const list = unitPrice(product, 'Sak', 'eceran');
    session.addLine(product, 'Sak');
    session.setDraft({
      lines: [{ ...need(session.state().draft.lines[0]), price: String(list + 2500) }],
    });
    expect(session.saveOrder()).toEqual({ ok: true, number: 'SO-0001', approval: false });
    const order = need(store.getState().salesOrders[0]);
    expect(order.total).toBe(list + 2500);
    expect(order.lines[0]).toMatchObject({ unitPrice: list + 2500, listPrice: list });
    expect(store.getState().approvals).toHaveLength(3);
  });

  it('menggabungkan alasan piutang terlambat dan harga di bawah tier dalam satu permintaan', () => {
    const { session, store, dataset, product } = setup();
    const customer = { ...lateCustomer(dataset, 12), limit: 900_000_000 };
    store.addCustomer(customer);
    const list = unitPrice(product, 'Sak', customer.tier);
    session.setDraft({ customerId: customer.id, payment: 'piutang' });
    session.addLine(product, 'Sak');
    session.setDraft({
      lines: [{ ...need(session.state().draft.lines[0]), price: String(list - 500) }],
    });
    const warned = session.saveOrder();
    expect(warned).toMatchObject({
      ok: false,
      warning: { reason: 'overdue', reasons: ['overdue', 'below-list'], kind: 'piutang' },
    });
    expect(session.saveOrder({ requestApproval: true })).toMatchObject({
      ok: true,
      approval: true,
    });
    const request = need(store.getState().approvals.at(-1));
    expect(request.kind).toBe('piutang');
    expect(request.detail).toContain('piutang terlambat');
    expect(request.detail).toContain('di bawah harga tier');
  });

  it('memakai tier pilihan katalog untuk pelanggan Umum saat menghitung harga tier', () => {
    const { session, store, product } = setup();
    session.setCatalogTier('kontraktor');
    session.addLine(product, 'Sak');
    const kontraktor = unitPrice(product, 'Sak', 'kontraktor');
    session.setDraft({
      lines: [{ ...need(session.state().draft.lines[0]), price: String(kontraktor + 100) }],
    });
    expect(session.saveOrder()).toMatchObject({ ok: true });
    expect(need(store.getState().salesOrders[0]).lines[0]).toMatchObject({
      unitPrice: kontraktor + 100,
      listPrice: kontraktor,
    });
    session.addLine(product, 'Sak');
    session.saveOrder();
    expect(need(store.getState().salesOrders[1]).total).toBe(kontraktor);
  });

  it('menolak harga nol dengan pesan harga umum pada baris yang bersangkutan', () => {
    const { session, product } = setup();
    session.addLine(product, 'Sak');
    session.setDraft({ lines: [{ ...need(session.state().draft.lines[0]), price: '0' }] });
    expect(session.saveOrder()).toMatchObject({ ok: false, messageId: 'MSG-066', line: 0 });
  });
});
