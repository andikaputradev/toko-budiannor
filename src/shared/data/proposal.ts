import { REFERENCE_DATE } from './generator';
import type { Customer, Dataset, Product, ReceivableInvoice, TierPrices, UnitDef } from './types';

export const ASSUMED_CREDIT_LIMIT = 50_000_000;
export const PROPOSAL_RECEIVABLE_TOTAL = 52_270_000;

const SALDO_DAYS = 30;

function dayOf(iso: string, offsetDays = 0): string {
  return new Date(Date.parse(iso) + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function tiers(eceran: number, grosir: number = eceran): TierPrices {
  return { eceran, grosir, kontraktor: grosir };
}

interface ProductSpec {
  readonly id: string;
  readonly code: string;
  readonly barcode?: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly allowDecimal?: boolean;
  readonly units: readonly (readonly [string, string, number, TierPrices])[];
  readonly toko: number;
  readonly gudang: number;
  readonly po: number | undefined;
  readonly photo: string;
  readonly rak?: string;
  readonly promo?: { readonly percent: number; readonly nominal: number };
  readonly hpp?: number;
  readonly minStock?: number;
  readonly minByWarehouse?: { readonly display: number; readonly besar: number };
}

function product(spec: ProductSpec): Product {
  const units: UnitDef[] = spec.units.map(([code, name, factor]) => ({ code, name, factor }));
  return {
    id: spec.id,
    code: spec.code,
    barcode: spec.barcode ?? '',
    name: spec.name,
    brand: spec.brand,
    category: spec.category,
    baseUnit: spec.units[0]?.[0] ?? '',
    allowDecimal: spec.allowDecimal ?? false,
    units,
    prices: Object.fromEntries(spec.units.map(([code, , , prices]) => [code, prices])),
    hpp: spec.hpp ?? 0,
    minStock: spec.minStock ?? 0,
    stock: { display: spec.toko, besar: spec.gudang },
    incoming: spec.po,
    photoUrl: `produk/${spec.photo}`,
    pinned: true,
    ...(spec.rak === undefined ? {} : { rak: spec.rak }),
    ...(spec.promo === undefined ? {} : { promo: spec.promo }),
    ...(spec.minByWarehouse === undefined ? {} : { minByWarehouse: spec.minByWarehouse }),
  };
}

// Sumber: sketsa POS proposal (halaman 3 PDF) dan Form Data Barang (halaman 5).
export const PROPOSAL_PRODUCTS: readonly Product[] = [
  product({
    id: 'P-01',
    code: 'P001',
    name: 'SEMEN GRESIK 40KG',
    brand: 'Gresik',
    category: 'Bahan Dasar',
    units: [['SAK', 'Sak', 1, tiers(70000)]],
    toko: 28,
    gudang: 800,
    po: undefined,
    photo: 'semen-gresik-40kg.webp',
    rak: '257B',
  }),
  product({
    id: 'P-02',
    code: 'P002',
    name: 'LEM FOX 70 GRAM',
    brand: 'Fox',
    category: 'Perekat',
    units: [
      ['KLG', 'Klg', 1, tiers(10000)],
      ['LSN', 'Lusin', 12, tiers(105000)],
      ['DOS', 'Dus', 72, tiers(600000)],
    ],
    toko: 78,
    gudang: 144,
    po: 72,
    photo: 'lem-fox-70gr.webp',
    rak: '118A',
  }),
  product({
    id: 'P-03',
    code: 'P003',
    name: 'CAT SPRAY PYLOX 109 BLACK',
    brand: 'Pylox',
    category: 'Cat',
    units: [
      ['KLG', 'Klg', 1, tiers(30000)],
      ['DOS', 'Dus', 12, tiers(345000)],
    ],
    toko: 7,
    gudang: 48,
    po: undefined,
    photo: 'cat-spray-pylox-109.webp',
    rak: '120A',
    promo: { percent: 10, nominal: 3000 },
  }),
  product({
    id: 'P-04',
    code: 'P004',
    name: 'KNEE PVC 3/4"',
    brand: '-',
    category: 'Pipa dan Fitting',
    units: [
      ['PCS', 'Pcs', 1, tiers(2000)],
      ['DOS', 'Dus', 100, tiers(175000)],
    ],
    toko: 220,
    gudang: 0,
    po: 300,
    photo: 'knee-pvc-3-4.webp',
    rak: '305C',
  }),
  product({
    id: 'P-05',
    code: 'P005',
    name: 'KABEL NYM 2X1,5MM',
    brand: '-',
    category: 'Listrik',
    allowDecimal: true,
    units: [
      ['MTR', 'Meter', 1, tiers(10000)],
      ['ROL', 'Roll', 100, tiers(900000)],
    ],
    toko: 115,
    gudang: 0,
    po: undefined,
    photo: 'kabel-nym-2x1-5.webp',
    rak: '210D',
  }),
  product({
    id: 'P-06',
    code: 'P006',
    name: 'GEMBOK KODAI 30MM',
    brand: 'Kodai',
    category: 'Aksesoris Pintu',
    units: [
      ['PCS', 'Pcs', 1, tiers(20000)],
      ['LSN', 'Lusin', 12, tiers(225000)],
      ['DOS', 'Dus', 120, tiers(2150000)],
    ],
    toko: 0,
    gudang: 0,
    po: 240,
    photo: 'gembok-kodai-30.webp',
    rak: '112B',
  }),
  product({
    id: 'P-07',
    code: '1059',
    barcode: '10005286',
    name: 'ENGSEL BELLUCCI SN 5',
    brand: 'Bellucci',
    category: 'Door & Window',
    units: [
      ['PSG', 'Pasang', 1, tiers(65000, 55000)],
      ['LSN', 'Lusin', 12, tiers(720000, 630000)],
      ['DOS', 'Dus', 120, tiers(7000000, 6000000)],
    ],
    toko: 66,
    gudang: 0,
    po: 0,
    photo: 'engsel-bellucci-sn5.webp',
    rak: '115B',
    hpp: 45550,
    minStock: 24,
    minByWarehouse: { display: 12, besar: 12 },
  }),
];

function invoice(
  id: string,
  issuedAt: string,
  dueAt: string,
  amount: number,
  paid = 0,
): ReceivableInvoice {
  return { id, issuedAt, dueAt, amount, paid };
}

function opening(code: string, amount: number): readonly ReceivableInvoice[] {
  const issued = dayOf(REFERENCE_DATE);
  return [invoice(`SALDO-AWAL-${code}`, issued, dayOf(REFERENCE_DATE, SALDO_DAYS), amount)];
}

interface CustomerSpec {
  readonly name: string;
  readonly code?: string;
  readonly phone?: string;
  readonly address?: string;
  readonly invoices: (code: string) => readonly ReceivableInvoice[];
}

function customer(index: number, spec: CustomerSpec): Customer {
  const number = 61 + index;
  const code = spec.code ?? `C${String(number).padStart(4, '0')}`;
  return {
    id: `C-${String(number).padStart(3, '0')}`,
    code,
    name: spec.name,
    phone: spec.phone ?? '',
    tier: 'eceran',
    limit: ASSUMED_CREDIT_LIMIT,
    invoices: spec.invoices(code),
    dueDays: SALDO_DAYS,
    pinned: true,
    ...(spec.address === undefined ? {} : { address: spec.address }),
  };
}

// Sumber: sketsa POS (hal. 3), Form Penjualan (hal. 6), Daftar Saldo Piutang (hal. 7).
export const PROPOSAL_CUSTOMERS: readonly Customer[] = [
  customer(0, { name: 'Kevin Wahyudi', code: 'PL387', invoices: () => [] }),
  customer(1, {
    name: 'Bu Sherly Tjoandra',
    phone: '0811230988',
    address: 'Jl. Rajawali No 17',
    invoices: (code) => opening(code, 8_500_000),
  }),
  customer(2, { name: 'CV Laut Mas', invoices: (code) => opening(code, 29_000_000) }),
  customer(3, {
    name: 'Pak Wahyudi',
    invoices: () => [
      invoice('FJ26091234', '2026-09-01', '2026-10-01', 1_500_000, 500_000),
      invoice('FJ26104444', '2026-10-22', '2026-11-22', 3_750_000),
      invoice('FJ26105678', '2026-10-25', '2026-11-25', 250_000),
      invoice('FJ26108899', '2026-10-26', '2026-11-02', 5_000_000),
    ],
  }),
  customer(4, { name: 'Toko ABC', invoices: (code) => opening(code, 770_000) }),
  customer(5, { name: 'Udin', invoices: (code) => opening(code, 1_200_000) }),
  customer(6, { name: 'Zaki', invoices: (code) => opening(code, 2_800_000) }),
];

export function withProposalData(dataset: Dataset): Dataset {
  if (dataset.products.some((item) => item.pinned === true)) {
    return dataset;
  }
  return {
    ...dataset,
    products: [...dataset.products, ...PROPOSAL_PRODUCTS],
    customers: [...dataset.customers, ...PROPOSAL_CUSTOMERS],
  };
}
