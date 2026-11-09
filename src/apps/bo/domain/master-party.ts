import {
  overdueInvoices,
  balanceOf,
  outstanding,
  remainingLimit,
  wibDate,
} from '../../../shared/data/receivable';
import type { Customer, PayableInvoice, Supplier, Tier } from '../../../shared/data/types';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import {
  ADDRESS_MAX,
  checkLength,
  checkNameAndCode,
  checkPhone,
  cleanCode,
  cleanText,
  compareNames,
  isNegativeText,
  issueLabel,
  issueMessage,
  moneyText,
  nextCode,
  numberIn,
  pad,
  parseDays,
  parseMoney,
  phoneOf,
  sameText,
  searchText,
} from './master-fields';
import { DEFAULT_DUE_DAYS } from '../../pos/domain/forms';
import { SUPPLIER_PROFILES } from './master-registry';
import type {
  KindAdapter,
  MasterContext,
  MasterDetail,
  MasterIssue,
  MasterMetric,
  MasterRow,
  MasterValues,
  PermissionKey,
} from './master-types';

/** Pemasok dan Pelanggan berasal dari dataset bersama; "hapus" berarti menonaktifkan. */
export const LIMIT_PERMISSION: PermissionKey = { screen: 'BO-11', action: 'Ubah Limit' };

const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
  kontraktor: 'tierKontraktor',
};

const SUPPLIER_SAMPLES: readonly MasterValues[] = [
  {
    name: 'CV Mitra Material Sejahtera',
    code: '',
    phone: '081355500311',
    address: 'Jl. Rungkut Madya No. 7, Surabaya',
  },
  {
    name: 'PT Karya Baja Utama',
    code: '',
    phone: '081355500312',
    address: 'Jl. Tambak Langon No. 21, Surabaya',
  },
  {
    name: 'UD Cipta Keramik',
    code: '',
    phone: '081355500313',
    address: 'Jl. Raya Mojosari No. 54, Mojokerto',
  },
];

const CUSTOMER_SAMPLES: readonly MasterValues[] = [
  {
    name: 'Toko Bangun Sentosa',
    code: '',
    phone: '081355500411',
    address: 'Jl. Raya Waru No. 31, Sidoarjo',
    tier: 'grosir',
    limit: '10.000.000',
    dueDays: '30',
  },
  {
    name: 'CV Griya Asri Konstruksi',
    code: '',
    phone: '081355500412',
    address: 'Jl. Dharmahusada Indah No. 9, Surabaya',
    tier: 'kontraktor',
    limit: '25.000.000',
    dueDays: '45',
  },
  {
    name: 'Bu Ratna Wulandari',
    code: '',
    phone: '081355500413',
    address: 'Jl. Gubeng Kertajaya No. 14, Surabaya',
    tier: 'eceran',
    limit: '0',
    dueDays: '30',
  },
];

function remainingOf(invoice: PayableInvoice): number {
  return Math.max(0, invoice.amount - invoice.paid);
}

// Hutang pemasok diturunkan dari faktur; tanpa faktur dipakai angka payable apa adanya.
function supplierBalance(supplier: Supplier): number {
  return supplier.invoices === undefined
    ? supplier.payable
    : supplier.invoices.reduce((sum, invoice) => sum + remainingOf(invoice), 0);
}

function supplierOverdue(supplier: Supplier, today: string): number {
  return (supplier.invoices ?? [])
    .filter((invoice) => invoice.dueAt < today)
    .reduce((sum, invoice) => sum + remainingOf(invoice), 0);
}

function money(value: number): string {
  return formatRupiah(value);
}

function dash(text: string): string {
  return text === '' ? '-' : text;
}

function statusText(inactive: boolean): string {
  return label(inactive ? 'masterStatusNonaktif' : 'masterStatusAktif');
}

function supplierRows(ctx: MasterContext): readonly MasterRow[] {
  const state = ctx.store.getState();
  const today = wibDate(ctx.now());
  return state.data.suppliers
    .map((supplier): MasterRow => {
      const profile = SUPPLIER_PROFILES[supplier.id];
      const code = supplier.code ?? profile?.code ?? `PM${pad(numberIn(supplier.id), 3)}`;
      const address = supplier.address ?? profile?.address ?? '';
      const invoices = supplier.invoices ?? [];
      const balance = supplierBalance(supplier);
      const overdue = supplierOverdue(supplier, today);
      const open = invoices.filter((invoice) => remainingOf(invoice) > 0).length;
      const orders = state.purchaseOrders.filter(
        (order) => order.supplierId === supplier.id,
      ).length;
      const inactive = supplier.active === false;
      const details: MasterDetail[] = [
        { label: 'masterFieldKode', value: code },
        { label: 'masterFieldNama', value: supplier.name },
        { label: 'masterFieldTelepon', value: dash(supplier.phone) },
        { label: 'masterFieldAlamat', value: dash(address) },
        { label: 'masterFieldStatus', value: statusText(inactive) },
        { label: 'masterMetHutang', value: money(balance) },
        { label: 'masterMetHutangTempo', value: money(overdue) },
        { label: 'masterMetFaktur', value: formatDecimal(invoices.length, 0) },
        { label: 'masterMetFakturBuka', value: formatDecimal(open, 0) },
        { label: 'masterMetPo', value: formatDecimal(orders, 0) },
      ];
      const metrics: MasterMetric[] = [
        { label: 'masterMetHutang', value: money(balance) },
        {
          label: 'masterMetHutangTempo',
          value: money(overdue),
          tone: overdue > 0 ? 'danger' : undefined,
        },
        { label: 'masterMetFaktur', value: formatDecimal(invoices.length, 0) },
        { label: 'masterMetPo', value: formatDecimal(orders, 0) },
      ];
      return {
        id: supplier.id,
        title: supplier.name,
        values: { code, name: supplier.name, phone: supplier.phone, address },
        cells: {
          code: { text: code },
          name: {
            text: supplier.name,
            sub: dash(supplier.phone),
            flag: inactive ? { text: label('masterBadgeNonaktif'), tone: 'neutral' } : undefined,
          },
          address: { text: dash(address) },
          balance: {
            text: money(balance),
            flag:
              overdue > 0 ? { text: label('masterBadgeLewatTempo'), tone: 'danger' } : undefined,
          },
        },
        details,
        metrics,
        usage: invoices.length + orders,
        progress: undefined,
        search: searchText([code, supplier.name, supplier.phone, address]),
        lockedFields: [],
        inactive,
        sealed: false,
      };
    })
    .sort((first, second) => compareNames(first.title, second.title));
}

export const supplierAdapter: KindAdapter = {
  rows: supplierRows,
  stats: (ctx, rows) => {
    const today = wibDate(ctx.now());
    const suppliers = ctx.store.getState().data.suppliers.filter((item) => item.active !== false);
    return [
      {
        label: 'masterStatPemasok',
        value: formatDecimal(rows.filter((row) => !row.inactive).length, 0),
      },
      {
        label: 'masterStatHutang',
        value: money(suppliers.reduce((sum, item) => sum + supplierBalance(item), 0)),
      },
      {
        label: 'masterStatHutangTempo',
        value: money(suppliers.reduce((sum, item) => sum + supplierOverdue(item, today), 0)),
      },
    ];
  },
  defaults: (_ctx, rows) => ({
    code: nextCode(
      'PM',
      rows.map((row) => row.values['code'] ?? ''),
    ),
    name: '',
    phone: '',
    address: '',
  }),
  validate: (values, _ctx, editing, rows) => {
    const others = rows.filter((row) => row.id !== editing?.id);
    return [
      ...checkNameAndCode(values, {
        entity: label('masterEntitasPemasok'),
        nameRequired: 'MSG-110',
        codeTaken: (code) => others.some((row) => cleanCode(row.values['code']) === code),
        nameTaken: (name) => others.some((row) => sameText(row.title, name)),
      }),
      ...checkPhone(values),
      ...checkLength(values, 'address', ADDRESS_MAX, 'masterErrAlamatPanjang'),
    ];
  },
  save: (values, ctx, editing) => {
    const name = cleanText(values['name']);
    const fields = {
      name,
      phone: phoneOf(values['phone']),
      code: cleanCode(values['code']),
      address: cleanText(values['address']),
    };
    const state = ctx.store.getState();
    const existing =
      editing === undefined
        ? undefined
        : state.data.suppliers.find((item) => item.id === editing.id);
    if (existing === undefined) {
      const next = Math.max(0, ...state.data.suppliers.map((item) => numberIn(item.id))) + 1;
      const id = `V-${pad(next, 3)}`;
      ctx.store.saveSupplier({ id, payable: 0, invoices: [], ...fields });
      return { id, title: name };
    }
    if (existing.name !== name) {
      for (const product of state.data.products) {
        if (product.supplierName === existing.name) {
          ctx.store.saveProduct({ ...product, supplierName: name });
        }
      }
    }
    ctx.store.saveSupplier({ ...existing, ...fields });
    return { id: existing.id, title: name };
  },
  blocker: (row, ctx) => {
    const supplier = ctx.store.getState().data.suppliers.find((item) => item.id === row.id);
    if (supplier === undefined) {
      return { labelKey: 'masterTolakBawaan', values: {} };
    }
    const balance = supplierBalance(supplier);
    return supplier.active !== false && balance > 0
      ? { labelKey: 'masterTolakHutang', values: { nama: supplier.name, jumlah: money(balance) } }
      : undefined;
  },
  remove: (row, ctx) => {
    const supplier = ctx.store.getState().data.suppliers.find((item) => item.id === row.id);
    if (supplier === undefined) {
      return { restored: false };
    }
    const restored = supplier.active === false;
    ctx.store.saveSupplier({ ...supplier, active: restored });
    return { restored };
  },
  samples: SUPPLIER_SAMPLES,
};

function isTier(value: string | undefined): value is Tier {
  return value === 'eceran' || value === 'grosir' || value === 'kontraktor';
}

function customerRows(ctx: MasterContext): readonly MasterRow[] {
  const state = ctx.store.getState();
  const now = ctx.now();
  const canLimit = ctx.allowed(LIMIT_PERMISSION);
  const salesBy = new Map<string, number>();
  for (const sale of state.data.sales) {
    if (sale.customerId !== undefined) {
      salesBy.set(sale.customerId, (salesBy.get(sale.customerId) ?? 0) + 1);
    }
  }
  for (const order of state.salesOrders) {
    if (order.customerId !== undefined) {
      salesBy.set(order.customerId, (salesBy.get(order.customerId) ?? 0) + 1);
    }
  }
  return state.data.customers
    .map((customer): MasterRow => {
      const address = customer.address ?? '';
      const dueDays = customer.dueDays ?? DEFAULT_DUE_DAYS;
      const balance = outstanding(customer);
      const left = remainingLimit(customer);
      const overdue = overdueInvoices(customer, now);
      const overdueSum = overdue.reduce((sum, invoice) => sum + balanceOf(invoice), 0);
      const inactive = customer.active === false;
      const deposit = customer.deposit ?? 0;
      const transactions = salesBy.get(customer.id) ?? 0;
      const tier = label(TIER_LABELS[customer.tier]);
      const details: MasterDetail[] = [
        { label: 'masterFieldKode', value: customer.code },
        { label: 'masterFieldNama', value: customer.name },
        { label: 'masterFieldTelepon', value: dash(customer.phone) },
        { label: 'masterFieldAlamat', value: dash(address) },
        { label: 'masterFieldTier', value: tier },
        { label: 'masterFieldLimit', value: money(customer.limit) },
        { label: 'masterFieldTempo', value: `${String(dueDays)} hari` },
        { label: 'masterFieldStatus', value: statusText(inactive) },
        { label: 'masterMetPiutang', value: money(balance) },
        { label: 'masterMetSisaLimit', value: money(left) },
        { label: 'masterMetPiutangTempo', value: money(overdueSum) },
        { label: 'masterMetDeposit', value: money(deposit) },
        { label: 'masterMetFaktur', value: formatDecimal(customer.invoices.length, 0) },
        { label: 'masterMetTransaksi', value: formatDecimal(transactions, 0) },
      ];
      const metrics: MasterMetric[] = [
        { label: 'masterMetPiutang', value: money(balance) },
        { label: 'masterMetSisaLimit', value: money(left), tone: left < 0 ? 'danger' : undefined },
        {
          label: 'masterMetPiutangTempo',
          value: money(overdueSum),
          tone: overdueSum > 0 ? 'danger' : undefined,
        },
        { label: 'masterMetDeposit', value: money(deposit) },
      ];
      return {
        id: customer.id,
        title: customer.name,
        values: {
          code: customer.code,
          name: customer.name,
          phone: customer.phone,
          address,
          tier: customer.tier,
          limit: moneyText(customer.limit),
          dueDays: String(dueDays),
        },
        cells: {
          code: { text: customer.code },
          name: {
            text: customer.name,
            sub: dash(customer.phone),
            flag: inactive ? { text: label('masterBadgeNonaktif'), tone: 'neutral' } : undefined,
          },
          tier: { text: tier, tone: 'neutral' },
          limit: { text: money(customer.limit) },
          balance: {
            text: money(balance),
            flag:
              overdueSum > 0 ? { text: label('masterBadgeLewatTempo'), tone: 'danger' } : undefined,
          },
        },
        details,
        metrics,
        usage: customer.invoices.length + transactions,
        progress: undefined,
        search: searchText([customer.code, customer.name, customer.phone, address, tier]),
        lockedFields: canLimit ? [] : ['limit'],
        inactive,
        sealed: false,
      };
    })
    .sort((first, second) => compareNames(first.title, second.title));
}

function checkCustomerNumbers(values: MasterValues, canLimit: boolean): MasterIssue[] {
  const issues: MasterIssue[] = [];
  if (canLimit && parseMoney(values['limit']) === undefined) {
    issues.push(
      isNegativeText(values['limit'])
        ? issueMessage('limit', 'MSG-088')
        : issueLabel('limit', 'masterErrAngka'),
    );
  }
  if (parseDays(values['dueDays']) === undefined) {
    issues.push(issueLabel('dueDays', 'jatuhTempoSalah'));
  }
  if (!isTier(values['tier'])) {
    issues.push(issueMessage('tier', 'MSG-107'));
  }
  return issues;
}

export const customerAdapter: KindAdapter = {
  rows: customerRows,
  stats: (ctx, rows) => {
    const now = ctx.now();
    const customers = ctx.store.getState().data.customers.filter((item) => item.active !== false);
    return [
      {
        label: 'masterStatPelanggan',
        value: formatDecimal(rows.filter((row) => !row.inactive).length, 0),
      },
      {
        label: 'masterStatPiutang',
        value: money(customers.reduce((sum, item) => sum + outstanding(item), 0)),
      },
      {
        label: 'masterStatPiutangTempo',
        value: money(
          customers.reduce(
            (sum, item) =>
              sum + overdueInvoices(item, now).reduce((inner, bill) => inner + balanceOf(bill), 0),
            0,
          ),
        ),
      },
    ];
  },
  defaults: (_ctx, rows) => ({
    code: nextCode(
      'C',
      rows.map((row) => row.values['code'] ?? ''),
      4,
    ),
    name: '',
    phone: '',
    address: '',
    tier: 'eceran',
    limit: '0',
    dueDays: String(DEFAULT_DUE_DAYS),
  }),
  validate: (values, ctx, editing, rows) => {
    const others = rows.filter((row) => row.id !== editing?.id);
    const phone = phoneOf(values['phone']);
    const issues: MasterIssue[] = checkNameAndCode(values, {
      entity: label('masterEntitasPelanggan'),
      nameRequired: 'MSG-043',
      codeTaken: (code) => others.some((row) => cleanCode(row.values['code']) === code),
      nameTaken: (name) =>
        others.some((row) => sameText(row.title, name) && phoneOf(row.values['phone']) === phone),
    }).map((issue) =>
      issue.labelKey === 'masterErrNamaPakai' ? issueMessage('name', 'MSG-045') : issue,
    );
    issues.push(...checkPhone(values));
    issues.push(...checkLength(values, 'address', ADDRESS_MAX, 'masterErrAlamatPanjang'));
    issues.push(...checkCustomerNumbers(values, ctx.allowed(LIMIT_PERMISSION)));
    return issues;
  },
  save: (values, ctx, editing) => {
    const canLimit = ctx.allowed(LIMIT_PERMISSION);
    const tier = isTier(values['tier']) ? values['tier'] : 'eceran';
    const state = ctx.store.getState();
    const existing: Customer | undefined =
      editing === undefined
        ? undefined
        : state.data.customers.find((item) => item.id === editing.id);
    const fields = {
      code: cleanCode(values['code']),
      name: cleanText(values['name']),
      phone: phoneOf(values['phone']),
      address: cleanText(values['address']),
      tier,
      dueDays: parseDays(values['dueDays']) ?? DEFAULT_DUE_DAYS,
    };
    const limit = canLimit ? (parseMoney(values['limit']) ?? 0) : (existing?.limit ?? 0);
    if (existing === undefined) {
      const next = Math.max(0, ...state.data.customers.map((item) => numberIn(item.id))) + 1;
      const id = `C-${pad(next, 3)}`;
      ctx.store.addCustomer({ id, invoices: [], limit, ...fields });
      return { id, title: fields.name };
    }
    ctx.store.saveCustomer({ ...existing, limit, ...fields });
    return { id: existing.id, title: fields.name };
  },
  blocker: (row, ctx) => {
    const customer = ctx.store.getState().data.customers.find((item) => item.id === row.id);
    if (customer === undefined) {
      return { labelKey: 'masterTolakBawaan', values: {} };
    }
    const balance = outstanding(customer);
    return customer.active !== false && balance > 0
      ? { labelKey: 'masterTolakPiutang', values: { nama: customer.name, jumlah: money(balance) } }
      : undefined;
  },
  remove: (row, ctx) => {
    const customer = ctx.store.getState().data.customers.find((item) => item.id === row.id);
    if (customer === undefined) {
      return { restored: false };
    }
    const restored = customer.active === false;
    ctx.store.saveCustomer({ ...customer, active: restored });
    return { restored };
  },
  samples: CUSTOMER_SAMPLES,
};
