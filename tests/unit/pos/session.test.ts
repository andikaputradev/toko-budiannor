import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { failureText } from '../../../src/apps/pos/failure';
import { createStore } from '../../../src/shared/store/store';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { withAmpleStock } from './support';

const dataset = withAmpleStock(generateDataset());

function setup(online = true) {
  const store = createStore({ dataset });
  store.setOnline(online);
  let now = 1_000_000;
  const session = createPosSession(store, { clock: () => now });
  return { store, session, advance: (ms: number) => (now += ms) };
}

function first() {
  const product = dataset.products[0];
  if (product === undefined) {
    throw new Error('data kosong');
  }
  return product;
}

describe('login', () => {
  it('menolak tanpa kasir terpilih, format salah, PIN salah, lalu mengunci pada percobaan ketiga', () => {
    const { session } = setup();
    expect(session.attemptLogin(undefined, '123456')).toMatchObject({
      ok: false,
      messageId: 'MSG-021',
    });
    expect(session.attemptLogin('U-3', '12')).toMatchObject({ ok: false, messageId: 'MSG-022' });
    const wrong = session.attemptLogin('U-3', '111111');
    expect(wrong).toMatchObject({ ok: false, messageId: 'MSG-023', values: { sisa: 2 } });
    expect(wrong.ok ? '' : failureText(wrong)).toBe('PIN salah. Sisa percobaan: 2.');
    expect(session.attemptLogin('U-3', '111111')).toMatchObject({ values: { sisa: 1 } });
    expect(session.attemptLogin('U-3', '111111')).toMatchObject({ messageId: 'MSG-024' });
    expect(session.attemptLogin('U-3', '123456')).toMatchObject({ messageId: 'MSG-024' });
  });

  it('menerima PIN benar, menyetel peran, dan membuka kunci setelah 5 menit', () => {
    const { session, store, advance } = setup();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      session.attemptLogin('U-4', '000000');
    }
    advance(5 * 60 * 1000);
    expect(session.attemptLogin('U-4', '123456')).toEqual({ ok: true });
    expect(session.state().loggedIn).toBe(true);
    expect(store.getState().userId).toBe('U-4');
    expect(store.getState().role).toBe('kasir');
  });

  it('menghitung percobaan terpisah untuk tiap kasir', () => {
    const { session } = setup();
    session.attemptLogin('U-3', '000000');
    expect(session.attemptLogin('U-4', '000000')).toMatchObject({ values: { sisa: 2 } });
  });
});

describe('bill dan transaksi', () => {
  it('menyelesaikan penjualan tunai, mengosongkan bill, dan menomori T-000141', () => {
    const { session } = setup();
    session.addProduct(first());
    session.addProduct(first());
    expect(session.state().lines[0]?.quantity).toBe(2);
    session.exactAmount();
    expect(session.summary().status).toBe('ready');
    const sale = session.finish();
    expect(sale?.number).toBe('T-000141');
    expect(sale?.total).toBe(session.state().sales.at(-1)?.total);
    expect(session.state().lines).toHaveLength(0);
    expect(session.pendingQueue()).toBe(3);
  });

  it('memasukkan transaksi offline ke antrean dan mencatat stok terjual', () => {
    const { session, store } = setup(false);
    const before = first().stock.display + first().stock.besar;
    session.addProduct(first(), 'Sak', 3);
    session.exactAmount();
    session.finish();
    expect(session.pendingQueue()).toBe(4);
    const stock = store.getState().data.products[0]?.stock;
    expect((stock?.display ?? 0) + (stock?.besar ?? 0)).toBeCloseTo(before - 120, 3);
  });

  it('menahan bill dengan nomor berikutnya dan mengosongkan layar', () => {
    const { session } = setup();
    expect(session.holdBill()).toBeUndefined();
    session.addProduct(first());
    const held = session.holdBill();
    expect(held?.number).toBe('B-0004');
    expect(session.state().lines).toHaveLength(0);
    expect(session.state().heldBills).toHaveLength(4);
  });

  it('menghitung ulang harga saat pelanggan Grosir dipilih', () => {
    const { session } = setup();
    session.addProduct(first(), 'Sak');
    const before = session.state().lines[0]?.unitPrice ?? 0;
    session.setCustomer('C-001');
    expect(session.customer()?.tier).toBe('grosir');
    expect(session.state().lines[0]?.unitPrice).toBeLessThan(before);
  });

  it('tidak menyelesaikan transaksi yang belum siap', () => {
    const { session } = setup();
    session.addProduct(first());
    expect(session.finish()).toBeUndefined();
  });
});

describe('otorisasi Owner untuk piutang', () => {
  function blocked() {
    const context = setup();
    context.session.addProduct(first(), 'Sak', 100);
    context.session.setCustomer('C-003');
    context.session.chooseReceivable('piutang');
    return context;
  }

  it('memblokir piutang yang melebihi limit sampai Owner menyetujui', () => {
    const { session } = blocked();
    expect(session.summary()).toMatchObject({ status: 'blocked', messageId: 'MSG-035' });
    expect(session.finish()).toBeUndefined();
  });

  it('memeriksa alasan, PIN salah dengan sisa percobaan, PIN bukan Owner, lalu PIN benar', () => {
    const { session } = blocked();
    expect(session.authorizeOwner('abc', '482916')).toMatchObject({ messageId: 'MSG-048' });
    expect(session.authorizeOwner('Pelanggan lama', '111222')).toMatchObject({
      messageId: 'MSG-049',
      values: { sisa: 2 },
    });
    expect(session.authorizeOwner('Pelanggan lama', '654321')).toMatchObject({
      messageId: 'MSG-050',
    });
    expect(session.authorizeOwner('Pelanggan lama', '482916')).toEqual({ ok: true });
    expect(session.summary().status).toBe('ready');
    expect(session.state().audit[0]).toMatchObject({
      ownerName: 'Bapak Haris',
      reason: 'Pelanggan lama',
    });
    const sale = session.finish();
    expect(sale?.payment).toBe('piutang');
    expect(sale?.paid).toBe(0);
  });

  it('mengunci otorisasi setelah tiga PIN salah', () => {
    const { session } = blocked();
    session.authorizeOwner('Pelanggan lama', '111111');
    session.authorizeOwner('Pelanggan lama', '222222');
    expect(session.authorizeOwner('Pelanggan lama', '333333')).toMatchObject({
      messageId: 'MSG-051',
    });
    expect(session.authorizeOwner('Pelanggan lama', '482916')).toMatchObject({
      messageId: 'MSG-051',
    });
  });

  it('mencabut persetujuan bila isi bill berubah', () => {
    const { session } = blocked();
    session.authorizeOwner('Pelanggan lama', '482916');
    session.addProduct(dataset.products[1] ?? first());
    expect(session.state().ownerApproved).toBe(false);
  });
});
