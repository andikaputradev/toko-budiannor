import { describe, expect, it } from 'vitest';
import { createBoSession } from '../../../src/apps/bo/bo-session';
import {
  buildNoteLines,
  defaultSettlement,
  describeImpact,
  describeIssue,
  findSource,
  hasRoom,
  partyOptions,
  planSettlement,
  returnedValue,
  returnSources,
  settlementsFor,
  suggestWarehouse,
  UMUM_KEY,
  validateReturn,
  type ReturnDraft,
  type ReturnKind,
} from '../../../src/apps/bo/domain/returns';
import { confirmRefund, saveReturn } from '../../../src/apps/bo/screens/return-actions';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Customer, Product, Sale, Supplier } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { need, sampleProduct } from './support';

const base = generateDataset();
const sample = sampleProduct();
const sak = need(sample.units.find((unit) => unit.name === 'Sak'));
const KG_PER_SAK = sak.factor;

const customer: Customer = {
  id: 'C-T1',
  code: 'CT001',
  name: 'Pelanggan Uji',
  phone: '0811000111',
  tier: 'eceran',
  limit: 5_000_000,
  invoices: [
    { id: 'INV-A', issuedAt: '2026-09-01', dueAt: '2026-10-01', amount: 300_000, paid: 0 },
    { id: 'INV-B', issuedAt: '2026-10-01', dueAt: '2026-11-01', amount: 200_000, paid: 50_000 },
  ],
};

const sale: Sale = {
  id: 'S-T1',
  number: 'T-900001',
  createdAt: '2026-10-18T03:00:00.000Z',
  cashierId: 'U-3',
  customerId: customer.id,
  lines: [{ productId: sample.id, unit: sak.code, quantity: 4, unitPrice: 70_000 }],
  total: 280_000,
  payment: 'tunai',
  paid: 280_000,
};

const walkIn: Sale = {
  ...sale,
  id: 'S-T2',
  number: 'T-900002',
  customerId: undefined,
  paid: 280_000,
};

const supplier: Supplier = {
  id: 'V-T1',
  name: 'Pemasok Uji',
  phone: '0812000222',
  payable: 600_000,
  invoices: [
    {
      id: 'FB-T1',
      issuedAt: '2026-10-01',
      dueAt: '2026-11-01',
      amount: 800_000,
      paid: 200_000,
      lines: [{ productId: sample.id, unit: sak.code, quantity: 10, unitPrice: 80_000 }],
    },
  ],
};

function build(stock = { display: 5, besar: 500 }) {
  const products: Product[] = base.products.map((product) =>
    product.id === sample.id ? { ...product, stock } : product,
  );
  const store = createStore({
    dataset: {
      ...base,
      products,
      customers: [...base.customers, customer],
      sales: [sale, walkIn, ...base.sales],
      suppliers: [supplier, ...base.suppliers],
    },
  });
  return { store, session: createBoSession(store) };
}

function stockOf(store: ReturnType<typeof build>['store']) {
  return need(store.getState().data.products.find((product) => product.id === sample.id)).stock;
}

function productMap(store: ReturnType<typeof build>['store']) {
  return new Map(store.getState().data.products.map((product) => [product.id, product]));
}

function draftOf(
  store: ReturnType<typeof build>['store'],
  kind: ReturnKind,
  number: string,
  patch: Partial<ReturnDraft> = {},
): ReturnDraft {
  const source = returnSources(kind, store.getState().data, store.getState().returnNotes).find(
    (item) => item.number === number,
  );
  return {
    source,
    picks: [{ index: 0, quantity: '1' }],
    reason: 'Barang rusak',
    settlement: 'tunai',
    warehouse: 'display',
    ...patch,
  };
}

describe('sumber retur dan perhitungan nilai', () => {
  it('membaca faktur penjualan kasir lengkap dengan sisa yang masih bisa diretur', () => {
    const { store } = build();
    const sources = returnSources('penjualan', store.getState().data, []);
    const found = need(findSource(sources, 't-900001'));
    expect(found.partyName).toBe('Pelanggan Uji');
    expect(found.total).toBe(280_000);
    expect(found.lines[0]).toMatchObject({ sold: 4, returned: 0, room: 4, unitName: 'Sak' });
    expect(hasRoom(found)).toBe(true);
    expect(findSource(sources, 'tidak-ada')).toBeUndefined();
  });

  it('memasukkan pelanggan umum dan mengurutkan pilihan pelanggan', () => {
    const { store } = build();
    const options = partyOptions(returnSources('penjualan', store.getState().data, []));
    expect(options[0]?.key).toBe(UMUM_KEY);
    expect(options.some((option) => option.key === customer.id)).toBe(true);
  });

  it('menghitung nilai retur dari harga faktur asal, proporsional bila baris berdiskon', () => {
    const plain = { productId: 'P', unit: 'SAK', quantity: 2, unitPrice: 1_337_000 };
    expect(returnedValue(plain, 0.5)).toBe(668_500);
    const discounted = {
      ...plain,
      quantity: 4,
      unitPrice: 100_000,
      discount: { kind: 'nominal' as const, value: 40_000 },
    };
    expect(returnedValue(discounted, 2)).toBe(180_000);
    expect(returnedValue(discounted, 4)).toBe(360_000);
  });

  it('membuat baris nota hanya dari jumlah yang sah', () => {
    const { store } = build();
    const source = need(returnSources('penjualan', store.getState().data, [])[0]);
    const lines = buildNoteLines(need(findSource([source], source.number)), [
      { index: 0, quantity: '1' },
      { index: 0, quantity: 'abc' },
    ]);
    expect(lines).toHaveLength(1);
  });
});

describe('validasi retur', () => {
  const products = (store: ReturnType<typeof build>['store']) => productMap(store);

  it('meminta faktur asal, minimal satu barang, dan alasan', () => {
    const { store } = build();
    const draft = draftOf(store, 'penjualan', 'T-900001');
    expect(validateReturn('penjualan', { ...draft, source: undefined }, products(store))).toEqual({
      type: 'faktur',
    });
    expect(validateReturn('penjualan', { ...draft, picks: [] }, products(store))).toEqual({
      type: 'barang',
    });
    const noReason = need(validateReturn('penjualan', { ...draft, reason: '  ' }, products(store)));
    expect(describeIssue(noReason)).toBe('Alasan retur wajib diisi.');
    expect(validateReturn('penjualan', draft, products(store))).toBeUndefined();
  });

  it('menolak jumlah melebihi yang dibeli dengan pesan satuan', () => {
    const { store } = build();
    const draft = draftOf(store, 'penjualan', 'T-900001', {
      picks: [{ index: 0, quantity: '5' }],
    });
    const issue = need(validateReturn('penjualan', draft, products(store)));
    expect(issue).toMatchObject({ type: 'melebihi', index: 0 });
    expect(describeIssue(issue)).toBe('Jumlah retur melebihi jumlah yang dibeli (4,0 Sak).');
  });

  it('menolak jumlah kosong, bukan angka, dan desimal pada barang bulat', () => {
    const { store } = build();
    const text = (quantity: string) =>
      describeIssue(
        need(
          validateReturn(
            'penjualan',
            draftOf(store, 'penjualan', 'T-900001', { picks: [{ index: 0, quantity }] }),
            products(store),
          ),
        ),
      );
    expect(text('abc')).toBe('Masukkan angka yang valid.');
    expect(text('0')).toBe('Jumlah harus lebih dari 0.');
    const whole = need(base.products.find((product) => !product.allowDecimal));
    expect(whole.allowDecimal).toBe(false);
  });

  it('menolak potong atau deposit untuk pelanggan umum dan uang melebihi yang dibayar', () => {
    const { store } = build();
    const umum = draftOf(store, 'penjualan', 'T-900002', { settlement: 'deposit' });
    expect(need(validateReturn('penjualan', umum, products(store))).type).toBe('pihak');
    expect(settlementsFor('penjualan', umum.source)).toEqual(['tunai', 'transfer']);

    const credit = draftOf(store, 'penjualan', 'T-900001', {
      picks: [{ index: 0, quantity: '4' }],
    });
    expect(validateReturn('penjualan', credit, products(store))).toBeUndefined();

    const soldOnCredit = { ...credit.source, paid: 50_000 } as NonNullable<ReturnDraft['source']>;
    const issue = need(
      validateReturn('penjualan', { ...credit, source: soldOnCredit }, products(store)),
    );
    expect(issue).toEqual({ type: 'dana', limit: 50_000 });
    expect(describeIssue(issue)).toContain('Rp 50.000');
  });

  it('retur pembelian menolak stok gudang yang tidak cukup dengan MSG-072', () => {
    const { store } = build({ display: 5, besar: 500 });
    const draft = draftOf(store, 'pembelian', 'FB-T1', {
      picks: [{ index: 0, quantity: '2' }],
      warehouse: 'display',
      settlement: 'potong',
    });
    const issue = need(validateReturn('pembelian', draft, products(store)));
    expect(issue.type).toBe('stok');
    expect(describeIssue(issue)).toContain('Jumlah melebihi stok gudang asal');
    expect(validateReturn('pembelian', { ...draft, warehouse: 'besar' }, products(store))).toBe(
      undefined,
    );
  });
});

describe('penyelesaian dan dampak', () => {
  it('membagi nilai retur menurut cara pengembalian', () => {
    expect(planSettlement('penjualan', 'tunai', 100_000, 0)).toEqual({
      applied: 0,
      toDeposit: 0,
      cash: 100_000,
    });
    expect(planSettlement('penjualan', 'deposit', 100_000, 0)).toEqual({
      applied: 0,
      toDeposit: 100_000,
      cash: 0,
    });
    expect(planSettlement('penjualan', 'potong', 100_000, 30_000)).toEqual({
      applied: 30_000,
      toDeposit: 70_000,
      cash: 0,
    });
    expect(planSettlement('pembelian', 'potong', 100_000, 30_000)).toEqual({
      applied: 30_000,
      toDeposit: 0,
      cash: 70_000,
    });
  });

  it('memilih cara bawaan menurut pembayaran dan saldo pihak', () => {
    const { store } = build();
    const paid = need(draftOf(store, 'penjualan', 'T-900001').source);
    expect(defaultSettlement('penjualan', paid, 450_000)).toBe('tunai');
    const credit = { ...paid, paid: 0 };
    expect(defaultSettlement('penjualan', credit, 450_000)).toBe('potong');
    expect(defaultSettlement('penjualan', credit, 0)).toBe('deposit');
    expect(defaultSettlement('penjualan', undefined, 0)).toBe('tunai');
  });

  it('menyarankan gudang yang mampu menanggung seluruh barang retur pembelian', () => {
    const { store } = build({ display: 5, besar: 500 });
    const source = need(draftOf(store, 'pembelian', 'FB-T1').source);
    const picks = [{ index: 0, quantity: '2' }];
    expect(suggestWarehouse('pembelian', source, picks, productMap(store))).toBe('besar');
    expect(suggestWarehouse('penjualan', source, picks, productMap(store))).toBe('display');
  });

  it('merangkum dampak stok, piutang, deposit, dan uang', () => {
    const rows = describeImpact(
      'penjualan',
      'display',
      'potong',
      { applied: 30_000, toDeposit: 70_000, cash: 0 },
      2,
    );
    expect(rows.map((row) => row.icon)).toEqual(['package', 'wallet', 'coins']);
    expect(rows[0]?.text).toContain('Display');
    expect(rows[1]?.text).toContain('Rp 30.000');
    expect(
      describeImpact(
        'penjualan',
        'display',
        'tunai',
        planSettlement('penjualan', 'tunai', 1, 0),
        0,
      ),
    ).toEqual([]);
  });
});

describe('menyimpan retur penjualan', () => {
  it('menambah stok, memberi nomor, mencatat log, dan menghitung sisa retur', () => {
    const { store, session } = build();
    const result = saveReturn(session, 'penjualan', draftOf(store, 'penjualan', 'T-900001'));
    expect(result.ok).toBe(true);
    const note = need(result.ok ? result.note : undefined);
    expect(note).toMatchObject({
      number: 'RJ-0001',
      kind: 'penjualan',
      total: 70_000,
      settlement: 'tunai',
      cash: 70_000,
      status: 'selesai',
      sourceNumber: 'T-900001',
    });
    expect(stockOf(store)).toEqual({ display: 5 + KG_PER_SAK, besar: 500 });
    expect(store.getState().returnNotes).toHaveLength(1);
    expect(store.getState().activity.at(-1)).toMatchObject({ kind: 'transaksi' });
    expect(store.getState().activity.at(-1)?.detail).toContain('RJ-0001');

    const next = need(draftOf(store, 'penjualan', 'T-900001').source);
    expect(next.lines[0]).toMatchObject({ returned: 1, room: 3 });
    const again = saveReturn(
      session,
      'penjualan',
      draftOf(store, 'penjualan', 'T-900001', { picks: [{ index: 0, quantity: '4' }] }),
    );
    expect(again).toMatchObject({ ok: false });
    expect(again.ok ? '' : again.text).toBe('Jumlah retur melebihi jumlah yang dibeli (3,0 Sak).');
    const second = saveReturn(session, 'penjualan', draftOf(store, 'penjualan', 'T-900001'));
    expect(second.ok ? second.note.number : '').toBe('RJ-0002');
  });

  it('memotong piutang faktur tertua lebih dulu dan tidak mengubah deposit', () => {
    const { store, session } = build();
    const result = saveReturn(
      session,
      'penjualan',
      draftOf(store, 'penjualan', 'T-900001', {
        picks: [{ index: 0, quantity: '4' }],
        settlement: 'potong',
      }),
    );
    const note = need(result.ok ? result.note : undefined);
    expect(note).toMatchObject({ applied: 280_000, toDeposit: 0, cash: 0, status: 'selesai' });
    const after = need(store.getState().data.customers.find((item) => item.id === customer.id));
    expect(after.invoices.find((invoice) => invoice.id === 'INV-A')?.paid).toBe(280_000);
    expect(after.invoices.find((invoice) => invoice.id === 'INV-B')?.paid).toBe(50_000);
    expect(after.deposit ?? 0).toBe(0);
  });

  it('menjadikan retur deposit pelanggan dan mencatat mutasinya', () => {
    const { store, session } = build();
    const result = saveReturn(
      session,
      'penjualan',
      draftOf(store, 'penjualan', 'T-900001', { settlement: 'deposit' }),
    );
    const note = need(result.ok ? result.note : undefined);
    expect(note).toMatchObject({ toDeposit: 70_000, applied: 0, cash: 0 });
    const after = need(store.getState().data.customers.find((item) => item.id === customer.id));
    expect(after.deposit).toBe(70_000);
    const entry = need(store.getState().depositEntries[0]);
    expect(entry).toMatchObject({
      kind: 'retur',
      customerId: customer.id,
      amount: 70_000,
      balanceAfter: 70_000,
      reference: note.number,
    });
  });

  it('menolak bila bukan Owner atau Supervisor atau saat offline', () => {
    const { store, session } = build();
    store.setOnline(false);
    const offline = saveReturn(session, 'penjualan', draftOf(store, 'penjualan', 'T-900001'));
    expect(offline.ok ? '' : offline.text).toContain('Tidak ada koneksi internet');
    store.setOnline(true);
    store.setRole('sales');
    const denied = saveReturn(session, 'penjualan', draftOf(store, 'penjualan', 'T-900001'));
    expect(denied.ok ? '' : denied.text).toContain('tidak memiliki hak akses');
    expect(store.getState().returnNotes).toHaveLength(0);
    expect(stockOf(store)).toEqual({ display: 5, besar: 500 });
  });
});

describe('menyimpan retur pembelian', () => {
  it('mengurangi stok gudang dan memotong hutang pemasok', () => {
    const { store, session } = build();
    const result = saveReturn(
      session,
      'pembelian',
      draftOf(store, 'pembelian', 'FB-T1', {
        picks: [{ index: 0, quantity: '2' }],
        warehouse: 'besar',
        settlement: 'potong',
      }),
    );
    const note = need(result.ok ? result.note : undefined);
    expect(note).toMatchObject({
      number: 'RB-0001',
      kind: 'pembelian',
      total: 160_000,
      applied: 160_000,
      cash: 0,
      status: 'selesai',
    });
    expect(stockOf(store)).toEqual({ display: 5, besar: 500 - 2 * KG_PER_SAK });
    const after = need(store.getState().data.suppliers.find((item) => item.id === supplier.id));
    expect(after.payable).toBe(440_000);
    expect(after.invoices?.[0]?.paid).toBe(360_000);
  });

  it('uang kembali dari pemasok berstatus menunggu sampai dana dikonfirmasi', () => {
    const { store, session } = build();
    const result = saveReturn(
      session,
      'pembelian',
      draftOf(store, 'pembelian', 'FB-T1', { warehouse: 'besar', settlement: 'tunai' }),
    );
    const note = need(result.ok ? result.note : undefined);
    expect(note).toMatchObject({ cash: 80_000, status: 'menunggu' });
    const done = confirmRefund(session, note.id);
    expect(done.ok && done.note.status).toBe('selesai');
    expect(store.getState().returnNotes[0]?.status).toBe('selesai');
    expect(confirmRefund(session, note.id).ok).toBe(false);
  });

  it('menolak uang kembali melebihi yang sudah dibayar ke pemasok', () => {
    const { store, session } = build();
    const result = saveReturn(
      session,
      'pembelian',
      draftOf(store, 'pembelian', 'FB-T1', {
        picks: [{ index: 0, quantity: '5' }],
        warehouse: 'besar',
        settlement: 'tunai',
      }),
    );
    expect(result.ok ? '' : result.text).toContain('Rp 200.000');
    expect(store.getState().returnNotes).toHaveLength(0);
  });
});
