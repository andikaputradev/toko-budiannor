import { formatDocumentNumber } from '../format';
import { BRANDS, BUSINESS_CORES, BUSINESS_PREFIXES, FAMILIES, PERSON_NAMES } from './catalog';
import { buildInvoiceLines } from './invoice-lines';
import { createRandom, type Random } from './prng';
import { unitPrice } from './units';
import type {
  AppUser,
  ApprovalRequest,
  BillLine,
  Customer,
  DailyRevenue,
  Dataset,
  ExpenseRecord,
  HeldBill,
  PayableInvoice,
  PaymentMethod,
  Product,
  ReceivableInvoice,
  Sale,
  Supplier,
  SyncItem,
  Tier,
  TierPrices,
  UnitDef,
} from './types';

export const DEFAULT_SEED = 20261018;
export const REFERENCE_DATE = '2026-10-19T03:00:00.000Z';
export const PRODUCT_COUNT = 3600;
export const CUSTOMER_COUNT = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const LIMITS = [1000000, 2500000, 5000000, 10000000, 20000000];

export const FICTIONAL_USERS: readonly AppUser[] = [
  {
    id: 'U-1',
    name: 'Bapak Haris',
    role: 'owner',
    pin: '482916',
    username: 'haris.owner',
    password: 'Kunci2026A',
    active: true,
  },
  {
    id: 'U-2',
    name: 'Ibu Sinta',
    role: 'supervisor',
    pin: '654321',
    username: 'sinta.spv',
    password: 'Kunci2026B',
    active: true,
  },
  {
    id: 'U-3',
    name: 'Dewi',
    role: 'kasir',
    pin: '123456',
    username: 'dewi.kasir',
    password: 'Kunci2026C',
    active: true,
  },
  {
    id: 'U-4',
    name: 'Rizal',
    role: 'kasir',
    pin: '123456',
    username: 'rizal.kasir',
    password: 'Kunci2026D',
    active: true,
  },
  {
    id: 'U-5',
    name: 'Agus',
    role: 'frontliner',
    pin: '123456',
    username: 'agus.front',
    password: 'Kunci2026E',
    active: true,
  },
  {
    id: 'U-6',
    name: 'Budi Lapangan',
    role: 'sales',
    pin: '123456',
    username: 'budi.sales',
    password: 'Kunci2026F',
    active: true,
  },
];

function roundPrice(value: number): number {
  return value >= 1000 ? Math.round(value / 100) * 100 : Math.round(value / 50) * 50;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isoDate(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function createProduct(index: number, random: Random): Product {
  const family = FAMILIES[index % FAMILIES.length];
  if (family === undefined) {
    throw new RangeError('Keluarga barang tidak ditemukan');
  }
  const rest = Math.floor(index / FAMILIES.length);
  const variantIndex = rest % family.variants.length;
  const brand = BRANDS[Math.floor(rest / family.variants.length) % BRANDS.length] ?? '';
  const ratio = variantIndex / (family.variants.length - 1);
  const brandFactor = 0.92 + (BRANDS.indexOf(brand) % 7) * 0.025;
  const basePrice = roundPrice(
    (family.priceMin + (family.priceMax - family.priceMin) * ratio) * brandFactor,
  );
  const units: UnitDef[] = [
    { code: family.baseUnit, name: family.baseUnit, factor: 1 },
    ...[...family.units]
      .sort((first, second) => first[1] - second[1])
      .map(([name, factor]) => ({ code: name, name, factor })),
  ];
  const prices: Record<string, TierPrices> = {};
  for (const unit of units) {
    const raw = basePrice * unit.factor * (unit.factor === 1 ? 1 : 0.98);
    prices[unit.code] = {
      eceran: roundPrice(raw),
      grosir: roundPrice(raw * 0.93),
      kontraktor: roundPrice(raw * 0.88),
    };
  }
  const scale = family.stockScale;
  const draw = (factor: number): number => {
    const value = random.next() * scale * factor;
    return family.decimal ? round3(value) : Math.round(value);
  };
  const minStock = Math.max(1, Math.round(scale * 0.04));
  let display = draw(0.2);
  let besar = draw(0.8);
  const roll = random.next();
  if (roll < 0.08) {
    display = 0;
  } else if (roll < 0.14) {
    besar = 0;
  } else if (roll < 0.19) {
    display = Math.min(display, Math.floor(minStock / 3));
    besar = Math.min(besar, Math.floor(minStock / 2));
  }
  const rakLetters = ['A', 'B', 'C', 'D'];
  const rakNumber = ((index * 17) % 350) + 1;
  const rak = `${String(rakNumber).padStart(3, '0')}${rakLetters[index % rakLetters.length] ?? 'A'}`;
  const weight =
    family.baseUnit === 'Kg' ? 1000 : family.baseUnit === 'Sak' ? 40000 : ((index % 20) + 1) * 150;
  const commPercent = (index % 3) + 1;
  const commNominal = roundPrice(basePrice * (commPercent / 100));
  const hasPromo = index % 4 === 0;
  const promoPercent = hasPromo ? 10 + (index % 15) : 0;
  const promoNominal = hasPromo ? roundPrice(basePrice * (promoPercent / 100)) : 0;
  const suppliers = [
    'PT Sekawan Jaya',
    'PT Nippon Paint Indonesia',
    'PT Rucika Mitra',
    'PT Semen Gresik Distribusi',
    'CV Makmur Sejahtera',
  ];
  const supplierName = suppliers[index % suppliers.length];
  const lastPurchasePrice = roundPrice(basePrice * 0.74);
  const hppAvg = roundPrice(basePrice * 0.78);
  const incomingList = [0, 0, 12, 24, 60, 120];
  const incoming = incomingList[index % incomingList.length];

  return {
    id: `P-${String(index + 1).padStart(4, '0')}`,
    code: `B${String(index + 1).padStart(4, '0')}`,
    barcode: `899${String(index + 1).padStart(10, '0')}`,
    name: `${family.name} ${family.variants[variantIndex] ?? ''} ${brand}`,
    brand,
    category: family.category,
    baseUnit: family.baseUnit,
    allowDecimal: family.decimal,
    units,
    prices,
    hpp: roundPrice(basePrice * 0.78),
    minStock,
    stock: { display, besar },
    rak,
    weight,
    salesCommission: { percent: commPercent, nominal: commNominal },
    promo: { percent: promoPercent, nominal: promoNominal },
    notes: index % 5 === 0 ? 'Barang stok banyak, harga diskon' : 'Stok reguler toko',
    supplierName,
    lastPurchaseDate: '2026-09-12',
    lastPurchasePrice,
    hppAvg,
    incoming,
    minByWarehouse: {
      display: Math.max(1, Math.round(minStock * 0.4)),
      besar: Math.max(1, Math.round(minStock * 0.6)),
    },
    initialStock: {
      date: '2026-01-01',
      quantity: display + besar,
      unit: family.baseUnit,
      unitPrice: roundPrice(basePrice * 0.78),
      warehouse: 'display',
    },
  };
}

function createInvoices(
  kind: number,
  limit: number,
  base: Date,
  random: Random,
  sequence: { value: number },
): ReceivableInvoice[] {
  const make = (dueOffset: number, amount: number): ReceivableInvoice => {
    sequence.value += 1;
    const amountRounded = Math.max(50000, Math.round(amount / 1000) * 1000);
    return {
      id: `INV-2610-${String(sequence.value).padStart(4, '0')}`,
      issuedAt: isoDate(base, dueOffset - 30),
      dueAt: isoDate(base, dueOffset),
      amount: amountRounded,
      paid: random.next() < 0.3 ? Math.round((amountRounded * 0.2) / 1000) * 1000 : 0,
    };
  };
  if (kind === 1) {
    return [make(random.int(5, 25), limit * (0.05 + random.next() * 0.2))];
  }
  if (kind === 2) {
    const remaining = random.int(200, 450) * 1000;
    const used = limit - remaining;
    return [make(random.int(4, 20), used * 0.6), make(random.int(6, 25), used * 0.4)].map(
      (invoice) => ({ ...invoice, paid: 0 }),
    );
  }
  if (kind === 3) {
    const late = [make(-random.int(3, 45), limit * (0.05 + random.next() * 0.25))];
    return random.next() < 0.5 ? [...late, make(random.int(3, 20), limit * 0.05)] : late;
  }
  if (kind === 4) {
    const count = random.int(0, 3);
    return Array.from({ length: count }, () =>
      make(random.int(-20, 20), limit * (0.03 + random.next() * 0.15)),
    );
  }
  return [];
}

function customerName(index: number): string {
  if (index < 40) {
    const prefix = BUSINESS_PREFIXES[index % BUSINESS_PREFIXES.length] ?? '';
    const core = BUSINESS_CORES[Math.floor(index / BUSINESS_PREFIXES.length)] ?? '';
    return `${prefix} ${core}`;
  }
  return PERSON_NAMES[index - 40] ?? `Pelanggan ${String(index + 1)}`;
}

function createCustomers(random: Random, base: Date): Customer[] {
  const sequence = { value: 0 };
  return Array.from({ length: CUSTOMER_COUNT }, (_, index) => {
    const name = customerName(index);
    const tier: Tier = index >= 40 ? 'eceran' : name.startsWith('Toko') ? 'grosir' : 'kontraktor';
    const limit = random.pick(LIMITS);
    return {
      id: `C-${String(index + 1).padStart(3, '0')}`,
      code: `C${String(index + 1).padStart(4, '0')}`,
      name,
      phone: `08${String(random.int(100000000, 999999999))}`,
      tier,
      limit,
      invoices: createInvoices(index % 5, limit, base, random, sequence),
      // Sebagian pelanggan menitipkan uang (deposit); nilainya dari indeks agar benih acak tetap sama.
      ...(index % 7 === 3 ? { deposit: ((index % 4) + 1) * 250000 } : {}),
    };
  });
}

function createLine(product: Product, tier: Tier, random: Random): BillLine {
  const unit = random.pick(product.units);
  const quantity = product.allowDecimal ? round3(random.int(1, 40) / 4) : random.int(1, 6);
  return {
    productId: product.id,
    unit: unit.code,
    quantity,
    unitPrice: unitPrice(product, unit.code, tier),
  };
}

function lineTotal(line: BillLine): number {
  return Math.round(line.quantity * line.unitPrice);
}

function createBills(products: readonly Product[], random: Random, base: Date): HeldBill[] {
  return [1, 2, 3].map((number) => ({
    id: `H-${String(number)}`,
    number: formatDocumentNumber('B', number),
    createdAt: new Date(base.getTime() - number * 40 * 60 * 1000).toISOString(),
    userId: number === 3 ? 'U-5' : 'U-3',
    customerId: number === 2 ? 'C-003' : undefined,
    lines: Array.from({ length: number + 1 }, () => {
      const product = random.pick(products);
      return createLine(product, 'eceran', random);
    }),
  }));
}

const TRADING_START_MS = 8 * 60 * 60 * 1000;

function saleTime(index: number, base: Date): Date {
  const dayStart = Math.floor((base.getTime() + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS;
  if (index < 30) {
    return new Date(dayStart - DAY_MS + TRADING_START_MS + index * 17 * 60 * 1000);
  }
  const time = dayStart + TRADING_START_MS + (index - 30) * 11 * 60 * 1000;
  return new Date(Math.min(time, base.getTime() - 60 * 1000));
}

function createSales(products: readonly Product[], random: Random, base: Date): Sale[] {
  const methods: readonly PaymentMethod[] = ['tunai', 'tunai', 'qris', 'transfer', 'piutang', 'dp'];
  return Array.from({ length: 40 }, (_, index) => {
    const lines = Array.from({ length: random.int(1, 4) }, () =>
      createLine(random.pick(products), 'eceran', random),
    );
    const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const payment = random.pick(methods);
    const registered = payment === 'piutang' || payment === 'dp';
    return {
      id: `S-${String(index + 1)}`,
      number: formatDocumentNumber('T', 101 + index),
      createdAt: saleTime(index, base).toISOString(),
      cashierId: index % 2 === 0 ? 'U-3' : 'U-4',
      customerId: registered
        ? `C-${String(random.int(1, CUSTOMER_COUNT)).padStart(3, '0')}`
        : undefined,
      lines,
      total,
      payment,
      paid: payment === 'piutang' ? 0 : payment === 'dp' ? Math.round(total * 0.3) : total,
    };
  });
}

function createDailyRevenue(sales: readonly Sale[], random: Random, base: Date): DailyRevenue[] {
  const totals = new Map<string, DailyRevenue>();
  for (const sale of sales) {
    const day = new Date(new Date(sale.createdAt).getTime() + WIB_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    const current = totals.get(day) ?? { date: day, revenue: 0, count: 0 };
    totals.set(day, { date: day, revenue: current.revenue + sale.total, count: current.count + 1 });
  }
  return Array.from({ length: 31 }, (_, index) => {
    const offset = 30 - index;
    const day = new Date(base.getTime() + WIB_OFFSET_MS - offset * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const known = totals.get(day);
    if (known !== undefined && offset <= 1) {
      return known;
    }
    return {
      date: day,
      revenue: random.int(4, 14) * 1000000 + random.int(0, 9) * 100000,
      count: random.int(18, 44),
    };
  });
}

const SUPPLIER_NAMES: readonly string[] = [
  'CV Sumber Bangunan Jaya',
  'PT Tiga Roda Semen',
  'UD Baja Perkasa',
  'CV Pipa Nusantara',
  'PT Cat Warna Indah',
  'UD Kayu Jati Makmur',
];

// Faktur pembelian supplier berutang: jumlah sisa seluruh faktur sama dengan payable supplier.
// Supplier tanpa hutang memiliki satu faktur lunas sebagai riwayat.
function createSupplierInvoices(
  index: number,
  payable: number,
  products: readonly Product[],
  base: Date,
  random: Random,
): PayableInvoice[] {
  const make = (order: number, remaining: number, paid: number, age: number): PayableInvoice => {
    const id = `FB2610${String(1100 + index * 10 + order)}`;
    const amount = remaining + paid;
    return {
      id,
      issuedAt: isoDate(base, -age),
      dueAt: isoDate(base, 30 - age),
      amount,
      paid,
      lines: buildInvoiceLines(id, amount, products, (product, unit) =>
        Math.round(product.hpp * unit.factor),
      ),
    };
  };
  if (payable <= 0) {
    return [make(0, 0, random.int(1, 5) * 1000000, random.int(35, 60))];
  }
  const count = random.int(1, 3);
  const chunk = Math.floor(payable / count / 1000) * 1000;
  return Array.from({ length: count }, (_, order) => {
    const remaining = order === count - 1 ? payable - chunk * (count - 1) : chunk;
    const paid = random.next() < 0.35 ? Math.round((remaining * 0.25) / 1000) * 1000 : 0;
    return make(order, remaining, paid, random.int(8, 44));
  });
}

function createSuppliers(
  random: Random,
  invoiceRandom: Random,
  products: readonly Product[],
  base: Date,
): Supplier[] {
  return SUPPLIER_NAMES.map((name, index) => {
    const phone = `08${String(random.int(100000000, 999999999))}`;
    const payable = index % 2 === 0 ? random.int(1, 8) * 1000000 : 0;
    return {
      id: `V-${String(index + 1).padStart(3, '0')}`,
      name,
      phone,
      payable,
      invoices: createSupplierInvoices(index, payable, products, base, invoiceRandom),
    };
  });
}

const EXPENSE_PLAN: readonly (readonly [
  number,
  string,
  string,
  number,
  'kasir' | 'back-office',
])[] = [
  [2, 'Gaji Pegawai', 'Gaji tahap pertama', 6500000, 'back-office'],
  [4, 'Listrik', 'Tagihan listrik toko', 1337000, 'back-office'],
  [5, 'Air', 'Tagihan air', 285000, 'back-office'],
  [6, 'Sewa', 'Sewa gudang besar', 4000000, 'back-office'],
  [8, 'Bensin', 'Bensin pengiriman', 120000, 'kasir'],
  [9, 'Parkir', 'Parkir', 5000, 'kasir'],
  [11, 'Ekspedisi', 'Ongkos kirim barang', 350000, 'kasir'],
  [12, 'Perawatan', 'Servis timbangan', 275000, 'back-office'],
  [15, 'Bensin', 'Bensin pengiriman', 150000, 'kasir'],
  [16, 'Parkir', 'Parkir', 5000, 'kasir'],
  [17, 'Ekspedisi', 'Ongkos kirim barang', 420000, 'kasir'],
  [18, 'Konsumsi', 'Konsumsi pegawai', 180000, 'back-office'],
  [19, 'Parkir', 'Parkir', 5000, 'kasir'],
];

function createExpenses(random: Random, base: Date): ExpenseRecord[] {
  const month = new Date(base.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 7);
  return EXPENSE_PLAN.map(([day, category, note, amount, source], index) => ({
    id: `E-${String(index + 1).padStart(3, '0')}`,
    date: `${month}-${String(day).padStart(2, '0')}`,
    category,
    note,
    amount: source === 'kasir' && amount > 5000 ? amount + random.int(0, 4) * 5000 : amount,
    source,
  }));
}

function createApprovals(
  bills: readonly HeldBill[],
  sales: readonly Sale[],
  base: Date,
): ApprovalRequest[] {
  const billTotal = (bills[1]?.lines ?? []).reduce((sum, line) => sum + lineTotal(line), 0);
  const correction = sales[2];
  const at = (minutes: number): string =>
    new Date(base.getTime() - minutes * 60 * 1000).toISOString();
  return [
    {
      id: 'AP-1',
      kind: 'diskon',
      status: 'menunggu',
      requestedBy: 'U-3',
      at: at(35),
      reference: 'B-0002',
      amount: Math.round(billTotal * 0.05),
      customerId: 'C-003',
      detail: 'Diskon 5 persen untuk bill B-0002',
      decidedBy: undefined,
      decidedAt: undefined,
      note: undefined,
    },
    {
      id: 'AP-2',
      kind: 'piutang',
      status: 'menunggu',
      requestedBy: 'U-3',
      at: at(20),
      reference: 'B-0002',
      amount: billTotal,
      customerId: 'C-003',
      detail: 'Piutang melebihi sisa limit pelanggan',
      decidedBy: undefined,
      decidedAt: undefined,
      note: undefined,
    },
    {
      id: 'AP-3',
      kind: 'koreksi',
      status: 'menunggu',
      requestedBy: 'U-2',
      at: at(10),
      reference: correction?.number ?? 'T-000103',
      amount: correction?.total ?? 0,
      customerId: correction?.customerId,
      detail: 'Salah harga barang',
      decidedBy: undefined,
      decidedAt: undefined,
      note: undefined,
    },
  ];
}

function createQueue(sales: readonly Sale[]): SyncItem[] {
  return sales.slice(-3).map((sale, index) => ({
    id: `Q-${String(index + 1)}`,
    saleNumber: sale.number,
    createdAt: sale.createdAt,
    status: 'menunggu',
    kind: 'transaksi',
    total: sale.total,
  }));
}

export function generateDataset(seed = DEFAULT_SEED, referenceDate = REFERENCE_DATE): Dataset {
  const base = new Date(referenceDate);
  const productRandom = createRandom(seed);
  const products = Array.from({ length: PRODUCT_COUNT }, (_, index) =>
    createProduct(index, productRandom),
  );
  const customers = createCustomers(createRandom(seed + 1), base);
  const bills = createBills(products, createRandom(seed + 2), base);
  const sales = createSales(products, createRandom(seed + 3), base);
  const dailyRevenue = createDailyRevenue(sales, createRandom(seed + 4), base);
  return {
    seed,
    referenceDate,
    products,
    customers,
    users: FICTIONAL_USERS,
    bills,
    sales,
    queue: createQueue(sales),
    dailyRevenue,
    suppliers: createSuppliers(createRandom(seed + 5), createRandom(seed + 31), products, base),
    expenses: createExpenses(createRandom(seed + 6), base),
    approvals: createApprovals(bills, sales, base),
  };
}
