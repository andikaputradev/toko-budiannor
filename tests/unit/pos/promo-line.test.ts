import { describe, expect, it } from 'vitest';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { isPromoLine, promoDiscountExpr } from '../../../src/shared/domain/promo';
import { createStore } from '../../../src/shared/store/store';

function setup() {
  const store = createStore({});
  store.setUser('U-1');
  const session = createPosSession(store, {
    clock: () => 1_000_000,
    schedule: (run) => {
      run();
    },
  });
  session.startShift(500_000);
  return { store, session };
}

function product(store: ReturnType<typeof createStore>, id: string) {
  const found = store.getState().data.products.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
}

describe('promo barang otomatis jadi diskon baris di POS', () => {
  it('barang berpromo masuk keranjang dengan diskon persen bawaan dan total terpotong', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    expect(session.addProduct(cat, 'KLG', 2).ok).toBe(true);
    const line = session.state().lines[0];
    expect(line?.discount).toEqual({ kind: 'persen', value: 10 });
    // 2 x 30.000 dikurangi 10 persen
    expect(session.subtotal()).toBe(54_000);
  });

  it('menambah barang yang sama menggabung baris dan mempertahankan diskon promo', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 1);
    session.addProduct(cat, 'KLG', 1);
    expect(session.state().lines).toHaveLength(1);
    expect(session.state().lines[0]?.quantity).toBe(2);
    expect(session.state().lines[0]?.discount).toEqual({ kind: 'persen', value: 10 });
  });

  it('barang tanpa promo tidak mendapat diskon', () => {
    const { session, store } = setup();
    const plain = store
      .getState()
      .data.products.find(
        (item) =>
          item.pinned === true &&
          item.stock.display > 5 &&
          (item.promo?.percent ?? 0) === 0 &&
          (item.promo?.nominal ?? 0) === 0,
      );
    if (plain === undefined) {
      throw new Error('tidak ada barang proposal tanpa promo');
    }
    session.addProduct(plain, plain.baseUnit, 1);
    expect(session.state().lines[0]?.discount).toBeUndefined();
  });

  it('isPromoLine benar untuk baris bawaan dan salah setelah diskon diubah atau dihapus', () => {
    const { session, store } = setup();
    const cat = product(store, 'P-03');
    session.addProduct(cat, 'KLG', 1);
    const initial = session.state().lines[0];
    expect(initial !== undefined && isPromoLine(initial, cat)).toBe(true);

    session.setLineDetail(0, { discount: { kind: 'persen', value: 5 } }, true);
    const changed = session.state().lines[0];
    expect(changed !== undefined && isPromoLine(changed, cat)).toBe(false);

    session.setLineDetail(0, { discount: null }, true);
    const removed = session.state().lines[0];
    expect(removed !== undefined && isPromoLine(removed, cat)).toBe(false);
  });
});

describe('promoDiscountExpr untuk Faktur Penjualan BO', () => {
  it('berisi persen promo sebagai ekspresi diskon, kosong bila tanpa promo persen', () => {
    expect(promoDiscountExpr({ promo: { percent: 10, nominal: 3000 } })).toBe('10');
    expect(promoDiscountExpr({ promo: { percent: 12.5, nominal: 0 } })).toBe('12.5');
    expect(promoDiscountExpr({ promo: { percent: 0, nominal: 3000 } })).toBe('');
    expect(promoDiscountExpr({})).toBe('');
  });
});
