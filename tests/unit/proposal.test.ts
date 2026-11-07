import { describe, expect, it } from 'vitest';
import { generateDataset, REFERENCE_DATE } from '../../src/shared/data/generator';
import {
  ASSUMED_CREDIT_LIMIT,
  PROPOSAL_CUSTOMERS,
  PROPOSAL_PRODUCTS,
  PROPOSAL_RECEIVABLE_TOTAL,
  withProposalData,
} from '../../src/shared/data/proposal';
import { balanceOf, checkReceivable } from '../../src/shared/data/receivable';
import { createStore } from '../../src/shared/store/store';

interface Expected {
  readonly name: string;
  readonly baseUnit: string;
  readonly units: readonly (readonly [string, number, number])[];
  readonly toko: number;
  readonly gudang: number;
  readonly po: number | undefined;
}

const TABLE: readonly Expected[] = [
  {
    name: 'SEMEN GRESIK 40KG',
    baseUnit: 'SAK',
    units: [['SAK', 1, 70000]],
    toko: 28,
    gudang: 800,
    po: undefined,
  },
  {
    name: 'LEM FOX 70 GRAM',
    baseUnit: 'KLG',
    units: [
      ['KLG', 1, 10000],
      ['LSN', 12, 105000],
      ['DOS', 72, 600000],
    ],
    toko: 78,
    gudang: 144,
    po: 72,
  },
  {
    name: 'CAT SPRAY PYLOX 109 BLACK',
    baseUnit: 'KLG',
    units: [
      ['KLG', 1, 30000],
      ['DOS', 12, 345000],
    ],
    toko: 7,
    gudang: 48,
    po: undefined,
  },
  {
    name: 'KNEE PVC 3/4"',
    baseUnit: 'PCS',
    units: [
      ['PCS', 1, 2000],
      ['DOS', 100, 175000],
    ],
    toko: 220,
    gudang: 0,
    po: 300,
  },
  {
    name: 'KABEL NYM 2X1,5MM',
    baseUnit: 'MTR',
    units: [
      ['MTR', 1, 10000],
      ['ROL', 100, 900000],
    ],
    toko: 115,
    gudang: 0,
    po: undefined,
  },
  {
    name: 'GEMBOK KODAI 30MM',
    baseUnit: 'PCS',
    units: [
      ['PCS', 1, 20000],
      ['LSN', 12, 225000],
      ['DOS', 120, 2150000],
    ],
    toko: 0,
    gudang: 0,
    po: 240,
  },
  {
    name: 'ENGSEL BELLUCCI SN 5',
    baseUnit: 'PSG',
    units: [
      ['PSG', 1, 65000],
      ['LSN', 12, 720000],
      ['DOS', 120, 7000000],
    ],
    toko: 66,
    gudang: 0,
    po: 0,
  },
];

const full = withProposalData(generateDataset());
const now = new Date(REFERENCE_DATE);

function product(name: string) {
  const found = PROPOSAL_PRODUCTS.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`barang tidak ada: ${name}`);
  }
  return found;
}

function customer(name: string) {
  const found = PROPOSAL_CUSTOMERS.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`pelanggan tidak ada: ${name}`);
  }
  return found;
}

describe('barang proposal', () => {
  it('berjumlah tujuh dan sama dengan tabel spec 3.2', () => {
    expect(PROPOSAL_PRODUCTS.map((item) => item.name)).toEqual(TABLE.map((row) => row.name));
    for (const row of TABLE) {
      const item = product(row.name);
      expect(item.baseUnit).toBe(row.baseUnit);
      expect(item.units.map((unit) => [unit.code, unit.factor, item.prices[unit.code]?.eceran])).toEqual(
        row.units.map(([code, factor, price]) => [code, factor, price]),
      );
      expect(item.stock).toEqual({ display: row.toko, besar: row.gudang });
      expect(item.incoming).toBe(row.po);
    }
  });

  it('Engsel Bellucci SN 5 memuat data Form Data Barang', () => {
    const engsel = product('ENGSEL BELLUCCI SN 5');
    expect(engsel).toMatchObject({
      code: '1059',
      barcode: '10005286',
      category: 'Door & Window',
      hpp: 45550,
      minStock: 24,
    });
    expect(engsel.minByWarehouse?.display).toBe(12);
  });

  it('Grosir hanya berbeda pada Engsel dan Kontraktor mengikuti Grosir', () => {
    const engsel = product('ENGSEL BELLUCCI SN 5');
    expect(engsel.prices['PSG']?.grosir).toBe(55000);
    expect(engsel.prices['LSN']?.grosir).toBe(630000);
    expect(engsel.prices['DOS']?.grosir).toBe(6000000);
    for (const item of PROPOSAL_PRODUCTS) {
      for (const prices of Object.values(item.prices)) {
        expect(prices.kontraktor).toBe(prices.grosir);
        if (item !== engsel) {
          expect(prices.grosir).toBe(prices.eceran);
        }
      }
    }
  });

  it('semua barang bertanda pinned dan punya foto', () => {
    for (const item of PROPOSAL_PRODUCTS) {
      expect(item.pinned).toBe(true);
      expect(item.photoUrl).toMatch(/^produk\/.+\.webp$/);
    }
  });
});

describe('pelanggan proposal', () => {
  it('berjumlah tujuh dengan saldo piutang 52.270.000', () => {
    expect(PROPOSAL_CUSTOMERS).toHaveLength(7);
    const total = PROPOSAL_CUSTOMERS.flatMap((item) => item.invoices).reduce(
      (sum, invoice) => sum + balanceOf(invoice),
      0,
    );
    expect(total).toBe(PROPOSAL_RECEIVABLE_TOTAL);
    expect(PROPOSAL_RECEIVABLE_TOTAL).toBe(52_270_000);
  });

  it('Kevin Wahyudi berkode PL387, tier eceran, tanpa piutang', () => {
    const kevin = customer('Kevin Wahyudi');
    expect(kevin).toMatchObject({ code: 'PL387', tier: 'eceran', limit: ASSUMED_CREDIT_LIMIT });
    expect(kevin.invoices).toHaveLength(0);
  });

  it('Bu Sherly memuat alamat dan telepon dari proposal', () => {
    expect(customer('Bu Sherly Tjoandra')).toMatchObject({
      address: 'Jl. Rajawali No 17',
      phone: '0811230988',
    });
  });

  it('piutang baru untuk Pak Wahyudi ditolak MSG-036 dan untuk Bu Sherly diterima', () => {
    expect(checkReceivable(customer('Pak Wahyudi'), 100000, now)).toMatchObject({
      ok: false,
      messageId: 'MSG-036',
    });
    expect(checkReceivable(customer('Bu Sherly Tjoandra'), 1_000_000, now)).toEqual({ ok: true });
  });

  it('Pak Wahyudi memiliki empat faktur proposal', () => {
    const faktur = customer('Pak Wahyudi').invoices.map((invoice) => [
      invoice.id,
      invoice.dueAt,
      balanceOf(invoice),
    ]);
    expect(faktur).toEqual([
      ['FJ26091234', '2026-10-01', 1_000_000],
      ['FJ26104444', '2026-11-22', 3_750_000],
      ['FJ26105678', '2026-11-25', 250_000],
      ['FJ26108899', '2026-11-02', 5_000_000],
    ]);
  });
});

describe('withProposalData', () => {
  it('menambah tujuh barang dan tujuh pelanggan di akhir tanpa duplikat', () => {
    expect(full.products).toHaveLength(3607);
    expect(full.customers).toHaveLength(67);
    expect(new Set(full.products.map((item) => item.id)).size).toBe(3607);
    expect(new Set(full.products.map((item) => item.code)).size).toBe(3607);
    expect(new Set(full.products.map((item) => item.name)).size).toBe(3607);
    const barcodes = full.products.map((item) => item.barcode).filter((code) => code !== '');
    expect(new Set(barcodes).size).toBe(barcodes.length);
    expect(new Set(full.customers.map((item) => item.id)).size).toBe(67);
    expect(new Set(full.customers.map((item) => item.code)).size).toBe(67);
    expect(full.products.slice(-7).every((item) => item.pinned === true)).toBe(true);
    expect(full.customers.slice(-7).every((item) => item.pinned === true)).toBe(true);
    expect(full.products.slice(0, 3600).some((item) => item.pinned === true)).toBe(false);
  });

  it('tidak menambah dua kali dan tidak mengubah isi lain', () => {
    const base = generateDataset();
    const twice = withProposalData(withProposalData(base));
    expect(twice.products).toHaveLength(3607);
    expect(twice.customers).toHaveLength(67);
    expect(twice.sales).toBe(base.sales);
    expect(twice.bills).toBe(base.bills);
    expect(twice.products[0]).toBe(base.products[0]);
  });

  it('store bawaan aplikasi memuat data proposal', () => {
    const store = createStore();
    expect(store.getState().data.products).toHaveLength(3607);
    expect(store.getState().data.customers).toHaveLength(67);
    store.close();
  });
});
