import type { Product, UnitDef, TierPrices } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';

export const TEMPLATE_COLUMNS = [
  'Kode',
  'Nama Barang',
  'Kategori Barang',
  'Merek Barang',
  'Satuan',
  'Satuan #2',
  'Rasio Satuan #2',
  'Satuan #3',
  'Rasio Satuan #3',
  'Nilai Satuan',
  'Qty Saldo Awal Toko',
  'Qty Saldo Awal Gudang',
  'Hrg Jual Satuan #1 Ecer',
  'Hrg Jual Satuan #2 Ecer',
  'Hrg Jual Satuan #3 Ecer',
  'Hrg Jual Satuan #1 Grosir',
  'Hrg Jual Satuan #2 Grosir',
  'Hrg Jual Satuan #3 Grosir',
  'Minimum Stok Semua',
  'Minimum Stok Toko',
  'No Rak',
  'Berat (gr)',
  'Kode Barcode',
] as const;

export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export interface ImportRowData {
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string;
  readonly baseUnit: string;
  readonly unit2?: string | undefined;
  readonly ratio2?: number | undefined;
  readonly unit3?: string | undefined;
  readonly ratio3?: number | undefined;
  readonly cost: number;
  readonly initialStockShop: number;
  readonly initialStockWarehouse: number;
  readonly retailPrice1: number;
  readonly retailPrice2?: number | undefined;
  readonly retailPrice3?: number | undefined;
  readonly wholesalePrice1: number;
  readonly wholesalePrice2?: number | undefined;
  readonly wholesalePrice3?: number | undefined;
  readonly minStockAll: number;
  readonly minStockShop: number;
  readonly rack: string;
  readonly weightGram: number;
  readonly barcode: string;
}

export interface ImportResult {
  readonly success: boolean;
  readonly messageId?: SystemMessageId | undefined;
  readonly importedCount: number;
  readonly products: readonly Product[];
  readonly errors: readonly string[];
}

export function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/\./g, '').replace(',', '.').trim();
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

export function parseString(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val).trim();
  return '';
}

/**
 * Konversi baris data mentah ke entitas Product
 */
export function rowToProduct(row: ImportRowData, index: number): Product {
  const baseUnit = row.baseUnit.trim();
  const units: UnitDef[] = [{ code: baseUnit, name: baseUnit, factor: 1 }];

  if (row.unit2 && row.ratio2 && row.ratio2 > 1) {
    units.push({ code: row.unit2.trim(), name: row.unit2.trim(), factor: row.ratio2 });
  }
  if (row.unit3 && row.ratio3 && row.ratio3 > 1) {
    units.push({ code: row.unit3.trim(), name: row.unit3.trim(), factor: row.ratio3 });
  }

  const prices: Record<string, TierPrices> = {};
  const contractorFactor = 0.95;

  prices[baseUnit] = {
    eceran: row.retailPrice1,
    grosir: row.wholesalePrice1 || row.retailPrice1,
    kontraktor: Math.round((row.wholesalePrice1 || row.retailPrice1) * contractorFactor),
  };

  if (row.unit2) {
    const ecer =
      (row.retailPrice2 ?? 0) > 0 ? (row.retailPrice2 ?? 0) : row.retailPrice1 * (row.ratio2 ?? 1);
    const grosir =
      (row.wholesalePrice2 ?? 0) > 0
        ? (row.wholesalePrice2 ?? 0)
        : row.wholesalePrice1 * (row.ratio2 ?? 1);
    prices[row.unit2.trim()] = {
      eceran: ecer,
      grosir,
      kontraktor: Math.round(grosir * contractorFactor),
    };
  }

  if (row.unit3) {
    const ecer =
      (row.retailPrice3 ?? 0) > 0 ? (row.retailPrice3 ?? 0) : row.retailPrice1 * (row.ratio3 ?? 1);
    const grosir =
      (row.wholesalePrice3 ?? 0) > 0
        ? (row.wholesalePrice3 ?? 0)
        : row.wholesalePrice1 * (row.ratio3 ?? 1);
    prices[row.unit3.trim()] = {
      eceran: ecer,
      grosir,
      kontraktor: Math.round(grosir * contractorFactor),
    };
  }

  const id = `IMP-${String(index + 1).padStart(4, '0')}`;
  const minStock = row.minStockAll > 0 ? row.minStockAll : Math.max(1, row.minStockShop);
  const minShop = row.minStockShop;
  const minGudang = Math.max(0, minStock - minShop);

  return {
    id,
    code: row.code,
    barcode: row.barcode || `899${String(index + 1).padStart(10, '0')}`,
    name: row.name,
    brand: row.brand || 'Umum',
    category: row.category || 'Lainnya',
    baseUnit,
    allowDecimal: false,
    units,
    prices,
    hpp: row.cost,
    minStock,
    stock: {
      display: row.initialStockShop,
      besar: row.initialStockWarehouse,
    },
    active: true,
    rak: row.rack,
    weight: row.weightGram,
    salesCommission: {
      percent: 1,
      nominal: Math.round(row.retailPrice1 * 0.01),
    },
    promo: { percent: 0, nominal: 0 },
    notes: 'Diimpor dari file Excel',
    supplierName: row.brand || 'Pemasok Utama',
    lastPurchaseDate: new Date().toISOString().slice(0, 10),
    lastPurchasePrice: row.cost,
    hppAvg: row.cost,
    incoming: 0,
    minByWarehouse: {
      display: minShop,
      besar: minGudang,
    },
    initialStock: {
      date: new Date().toISOString().slice(0, 10),
      quantity: row.initialStockShop + row.initialStockWarehouse,
      unit: baseUnit,
      unitPrice: row.cost,
      warehouse: 'display',
    },
  };
}

/**
 * Validasi dan konversi list objek mentah menjadi produk
 */
export function validateAndConvertImport(
  rawRows: readonly Record<string, unknown>[],
): ImportResult {
  if (rawRows.length === 0) {
    return {
      success: false,
      messageId: 'MSG-101',
      importedCount: 0,
      products: [],
      errors: ['File tidak berisi baris data yang valid'],
    };
  }

  const products: Product[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const raw = rawRows[i] ?? {};
    const code = parseString(raw['Kode'] ?? raw['Kode '] ?? raw['code']);
    const name = parseString(raw['Nama Barang'] ?? raw['nama'] ?? raw['name']);
    const baseUnit = parseString(raw['Satuan'] ?? raw['satuan'] ?? raw['baseUnit']);

    if (!baseUnit) {
      errors.push(`Baris ${i + 2}: Satuan dasar wajib diisi`);
      continue;
    }
    if (!name) {
      errors.push(`Baris ${i + 2}: Nama barang wajib diisi`);
      continue;
    }

    const u2 = parseString(raw['Satuan #2']);
    const r2 = parseNumber(raw['Rasio Satuan #2']);
    const u3 = parseString(raw['Satuan #3']);
    const r3 = parseNumber(raw['Rasio Satuan #3']);
    const ep2 = parseNumber(raw['Hrg Jual Satuan #2 Ecer']);
    const ep3 = parseNumber(raw['Hrg Jual Satuan #3 Ecer']);
    const wp2 = parseNumber(raw['Hrg Jual Satuan #2 Grosir']);
    const wp3 = parseNumber(raw['Hrg Jual Satuan #3 Grosir']);

    const rowData: ImportRowData = {
      code: code !== '' ? code : `B-${String(i + 1).padStart(4, '0')}`,
      name,
      category: parseString(raw['Kategori Barang'] ?? raw['kategori']),
      brand: parseString(raw['Merek Barang'] ?? raw['merk'] ?? raw['brand']),
      baseUnit,
      unit2: u2 !== '' ? u2 : undefined,
      ratio2: r2 > 0 ? r2 : undefined,
      unit3: u3 !== '' ? u3 : undefined,
      ratio3: r3 > 0 ? r3 : undefined,
      cost: parseNumber(raw['Nilai Satuan'] ?? raw['hpp']),
      initialStockShop: parseNumber(raw['Qty Saldo Awal Toko']),
      initialStockWarehouse: parseNumber(raw['Qty Saldo Awal Gudang']),
      retailPrice1: parseNumber(raw['Hrg Jual Satuan #1 Ecer']),
      retailPrice2: ep2 > 0 ? ep2 : undefined,
      retailPrice3: ep3 > 0 ? ep3 : undefined,
      wholesalePrice1: parseNumber(raw['Hrg Jual Satuan #1 Grosir']),
      wholesalePrice2: wp2 > 0 ? wp2 : undefined,
      wholesalePrice3: wp3 > 0 ? wp3 : undefined,
      minStockAll: parseNumber(raw['Minimum Stok Semua']),
      minStockShop: parseNumber(raw['Minimum Stok Toko']),
      rack: parseString(raw['No Rak'] ?? raw['rak']),
      weightGram: parseNumber(raw['Berat (gr)'] ?? raw['berat']),
      barcode: parseString(raw['Kode Barcode'] ?? raw['barcode']),
    };

    products.push(rowToProduct(rowData, products.length));
  }

  if (products.length === 0 && errors.length > 0) {
    return {
      success: false,
      messageId: 'MSG-102',
      importedCount: 0,
      products: [],
      errors,
    };
  }

  return {
    success: true,
    importedCount: products.length,
    products,
    errors,
  };
}

/**
 * 10 SKU Sampel dari docs/item-import apk.xlsx untuk demo dan migrasi instan
 */
export const SAMPLE_EXCEL_DATA: readonly ImportRowData[] = [
  {
    code: '0001',
    name: 'SEMEN GRESIK 40KG',
    category: 'BUILDING MATERIAL',
    brand: 'GRESIK',
    baseUnit: 'SAK',
    cost: 66000,
    initialStockShop: 300,
    initialStockWarehouse: 700,
    retailPrice1: 70000,
    wholesalePrice1: 68000,
    minStockAll: 50,
    minStockShop: 10,
    rack: '001A',
    weightGram: 40000,
    barcode: '12345678',
  },
  {
    code: '1598',
    name: 'MESIN GERINDA MAKITA M0900B',
    category: 'POWER TOOLS',
    brand: 'MAKITA',
    baseUnit: 'PCS',
    cost: 430000,
    initialStockShop: 24,
    initialStockWarehouse: 0,
    retailPrice1: 500000,
    wholesalePrice1: 475000,
    minStockAll: 3,
    minStockShop: 1,
    rack: '117B',
    weightGram: 2000,
    barcode: '23456789',
  },
  {
    code: '1997',
    name: 'KERAMIK 40X40 ASIA TILE MURANO',
    category: 'CERAMIC',
    brand: 'ASIA TILE',
    baseUnit: 'DOS',
    cost: 61000,
    initialStockShop: 150,
    initialStockWarehouse: 258,
    retailPrice1: 75000,
    wholesalePrice1: 70000,
    minStockAll: 20,
    minStockShop: 5,
    rack: '001B',
    weightGram: 16000,
    barcode: '34567890',
  },
  {
    code: '0013',
    name: 'KNEE PVC RUCIKA 3/4',
    category: 'PLUMBING SANITARY',
    brand: 'RUCIKA',
    baseUnit: 'PCS',
    unit2: 'DOS',
    ratio2: 250,
    cost: 2250,
    initialStockShop: 585,
    initialStockWarehouse: 2000,
    retailPrice1: 5000,
    retailPrice2: 1000000,
    wholesalePrice1: 3500,
    wholesalePrice2: 825000,
    minStockAll: 250,
    minStockShop: 50,
    rack: '305C',
    weightGram: 40,
    barcode: '01234567',
  },
  {
    code: '3555',
    name: 'CAT PYLOX 300CC PB100 CLEAR',
    category: 'PAINT',
    brand: 'NIPPON PAINT',
    baseUnit: 'KLG',
    unit2: 'DOS',
    ratio2: 12,
    cost: 21000,
    initialStockShop: 120,
    initialStockWarehouse: 0,
    retailPrice1: 30000,
    retailPrice2: 345000,
    wholesalePrice1: 28000,
    wholesalePrice2: 330000,
    minStockAll: 12,
    minStockShop: 3,
    rack: '111F',
    weightGram: 300,
    barcode: '77225588',
  },
  {
    code: '0017',
    name: 'KABEL NYM ETERNA 2X1,5 MM 100MTR',
    category: 'ELECTRICAL',
    brand: 'ETERNA',
    baseUnit: 'MTR',
    unit2: 'ROL',
    ratio2: 100,
    cost: 9500,
    initialStockShop: 325,
    initialStockWarehouse: 500,
    retailPrice1: 12500,
    retailPrice2: 1150000,
    wholesalePrice1: 11500,
    wholesalePrice2: 1100000,
    minStockAll: 50,
    minStockShop: 10,
    rack: '105C',
    weightGram: 120,
    barcode: '33225588',
  },
  {
    code: '0018',
    name: 'GEMBOK CHROME KODAI PANJANG 30MM',
    category: 'DOOR WINDOW',
    brand: 'KODAI',
    baseUnit: 'PCS',
    unit2: 'LSN',
    ratio2: 12,
    unit3: 'DOS',
    ratio3: 72,
    cost: 6800,
    initialStockShop: 50,
    initialStockWarehouse: 72,
    retailPrice1: 15000,
    retailPrice2: 150000,
    retailPrice3: 875000,
    wholesalePrice1: 12500,
    wholesalePrice2: 135000,
    wholesalePrice3: 810000,
    minStockAll: 24,
    minStockShop: 6,
    rack: '225B',
    weightGram: 200,
    barcode: '88995566',
  },
  {
    code: '2233',
    name: 'KRAN PVC AMICO TAMAN 3/4',
    category: 'PLUMBING SANITARY',
    brand: 'AMICO',
    baseUnit: 'PCS',
    unit2: 'LSN',
    ratio2: 12,
    unit3: 'DOS',
    ratio3: 288,
    cost: 16000,
    initialStockShop: 255,
    initialStockWarehouse: 864,
    retailPrice1: 20000,
    retailPrice2: 225000,
    retailPrice3: 2640000,
    wholesalePrice1: 18000,
    wholesalePrice2: 210000,
    wholesalePrice3: 2500000,
    minStockAll: 24,
    minStockShop: 6,
    rack: '218A',
    weightGram: 30,
    barcode: '22233355',
  },
  {
    code: '4125',
    name: 'SEKRUP GYPSUM STEEL 6X1.1/4',
    category: 'FASTENER',
    brand: 'STEEL',
    baseUnit: 'PCS',
    unit2: 'KTK',
    ratio2: 1000,
    unit3: 'DOS',
    ratio3: 8000,
    cost: 74,
    initialStockShop: 16500,
    initialStockWarehouse: 80000,
    retailPrice1: 300,
    retailPrice2: 100000,
    retailPrice3: 760000,
    wholesalePrice1: 200,
    wholesalePrice2: 90000,
    wholesalePrice3: 720000,
    minStockAll: 16000,
    minStockShop: 3000,
    rack: '119B',
    weightGram: 2,
    barcode: '12345688',
  },
  {
    code: '3600',
    name: 'BATU POTONG WD 4',
    category: 'ACCESORIS TOOLS',
    brand: 'WD',
    baseUnit: 'PCS',
    unit2: 'KTK',
    ratio2: 20,
    unit3: 'DOS',
    ratio3: 600,
    cost: 2650,
    initialStockShop: 3000,
    initialStockWarehouse: 6000,
    retailPrice1: 5000,
    retailPrice2: 80000,
    retailPrice3: 2250000,
    wholesalePrice1: 4000,
    wholesalePrice2: 70000,
    wholesalePrice3: 2100000,
    minStockAll: 6000,
    minStockShop: 100,
    rack: '115B',
    weightGram: 50,
    barcode: '87654321',
  },
];

export function getSampleExcelProducts(): readonly Product[] {
  return SAMPLE_EXCEL_DATA.map((row, i) => rowToProduct(row, i));
}
