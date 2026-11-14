import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import { createStore } from '../../../src/shared/store/store';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { returnReceipt, saleReceipt } from '../../../src/apps/pos/screens/receipt-preview';

const dataset = withProposalData(generateDataset());

function sellByTransfer() {
  const store = createStore({ dataset });
  store.setUser('U-3');
  const session = createPosSession(store, { clock: () => 1_000_000 });
  session.startShift(100000);
  const product = dataset.products.find((item) => item.id === 'P-01');
  if (product === undefined) {
    throw new Error('barang proposal tidak ada');
  }
  session.addProduct(product, 'SAK', 2);
  session.chooseSingle('transfer', 'BCA');
  const sale = session.finish();
  if (sale === undefined) {
    throw new Error('penjualan gagal');
  }
  return { session, sale };
}

describe('kanal pada struk dan bukti retur', () => {
  it('struk penjualan memuat kanal pada baris pembayaran', () => {
    const { session, sale } = sellByTransfer();
    const receipt = saleReceipt(session, sale, 'sale');
    expect(receipt.payments).toEqual([{ method: 'Transfer BCA', amount: 140000 }]);
  });

  it('bukti retur memuat kanal pengembalian pada baris pembayaran', () => {
    const { session, sale } = sellByTransfer();
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'transfer', amount: 70000, channel: 'BCA' },
    });
    expect(result.ok).toBe(true);
    const record = session.state().returns[0];
    if (record === undefined) {
      throw new Error('retur tidak tersimpan');
    }
    expect(returnReceipt(session, record).payments).toEqual([
      { method: 'Transfer BCA', amount: 70000 },
    ]);
  });

  it('pembayaran tanpa kanal tetap memakai nama metode saja', () => {
    const { session } = sellByTransfer();
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 1);
    session.chooseSingle('transfer');
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan gagal');
    }
    expect(saleReceipt(session, sale, 'sale').payments).toEqual([
      { method: 'Transfer', amount: 70000 },
    ]);
  });
});
