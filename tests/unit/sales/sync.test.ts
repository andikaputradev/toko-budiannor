import { describe, expect, it } from 'vitest';
import { createOwnerSession } from '../../../src/apps/owner/owner-session';
import { need, setup } from './support';

describe('status sinkron Sales Order (F-10)', () => {
  it('menandai SO dari Sales belum sinkron saat offline dan sinkron setelah antrean terkirim', () => {
    const { session, store, product } = setup({ online: false });
    session.addLine(product, 'Sak');
    expect(session.saveOrder()).toMatchObject({ ok: true, number: 'SO-0001' });
    expect(need(store.getState().salesOrders[0]).synced).toBe(false);
    expect(session.state().queue[0]?.orderNumber).toBe('SO-0001');
    store.setOnline(true);
    expect(need(store.getState().salesOrders[0]).synced).toBe(true);
    expect(session.pending()).toBe(0);
  });

  it('menandai SO sinkron langsung saat online', () => {
    const { session, store, product } = setup();
    session.addLine(product, 'Sak');
    session.saveOrder();
    expect(need(store.getState().salesOrders[0]).synced).toBe(true);
  });

  it('memperlakukan SO Owner dengan aturan yang sama', () => {
    const { store, product } = setup({ signedIn: false });
    const owner = createOwnerSession(store, {
      schedule: (run) => {
        run();
      },
    });
    store.setOnline(true);
    expect(owner.login('haris.owner', 'Kunci2026A')).toEqual({ ok: true });
    store.setOnline(false);
    const result = owner.saveSalesOrder({
      customerId: '',
      lines: [{ productId: product.id, unit: 'Sak', quantity: '1' }],
      payment: 'tunai',
      downPayment: '',
    });
    expect(result).toEqual({ ok: true, number: 'SO-0001' });
    expect(need(store.getState().salesOrders[0]).synced).toBe(false);
    store.setOnline(true);
    expect(need(store.getState().salesOrders[0]).synced).toBe(true);
  });

  it('menandai sinkron hanya SO yang nomornya cocok', () => {
    const { store } = setup({ signedIn: false });
    store.markSalesOrderSynced('SO-9999');
    expect(store.getState().salesOrders).toEqual([]);
  });
});
