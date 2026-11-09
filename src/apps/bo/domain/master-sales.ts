import { wibDate } from '../../../shared/data/receivable';
import type { AppUser } from '../../../shared/data/types';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { lineSubtotal } from '../../pos/domain/bill';
import {
  NOTE_MAX,
  checkLength,
  checkNameAndCode,
  checkPhone,
  cleanCode,
  cleanText,
  compareNames,
  issueLabel,
  moneyText,
  nextCode,
  numberIn,
  pad,
  parseMoney,
  parsePercent,
  percentText,
  phoneOf,
  sameText,
  searchText,
} from './master-fields';
import {
  DEFAULT_COMMISSION,
  DEFAULT_TARGET,
  SALES_PROFILES,
  registryOf,
  type SalesProfile,
  type SalesRole,
} from './master-registry';
import type {
  KindAdapter,
  MasterContext,
  MasterDetail,
  MasterIssue,
  MasterMetric,
  MasterRow,
  MasterValues,
} from './master-types';

/** Sales: akun berperan sales atau frontliner ditambah sales yang dicatat langsung pada master. */
const ROLE_LABELS: Readonly<Record<SalesRole, LabelKey>> = {
  sales: 'peranSales',
  frontliner: 'peranFrontliner',
};

const SAMPLES: readonly MasterValues[] = [
  {
    name: 'Hendra Prasetyo',
    code: '',
    role: 'sales',
    phone: '081355500511',
    commission: '1',
    target: '120.000.000',
    note: 'Sales kanvas area Sidoarjo',
  },
  {
    name: 'Yusuf Maulana',
    code: '',
    role: 'sales',
    phone: '081355500512',
    commission: '1,5',
    target: '180.000.000',
    note: 'Sales proyek kontraktor',
  },
];

function isSalesRole(role: string | undefined): role is SalesRole {
  return role === 'sales' || role === 'frontliner';
}

function userRole(user: AppUser): SalesRole | undefined {
  return isSalesRole(user.role) ? user.role : undefined;
}

function ensureProfiles(ctx: MasterContext): SalesProfile[] {
  const registry = registryOf(ctx.store);
  for (const user of ctx.store.getState().data.users) {
    const role = userRole(user);
    if (role === undefined) {
      continue;
    }
    const existing = registry.sales.get(user.id);
    if (existing === undefined) {
      registry.sales.set(user.id, {
        id: user.id,
        source: 'pengguna',
        name: user.name,
        code: nextCode(
          'SL',
          [...registry.sales.values()].map((item) => item.code),
        ),
        phone: SALES_PROFILES[user.id]?.phone ?? '',
        role,
        commission: DEFAULT_COMMISSION[role],
        target: DEFAULT_TARGET[role],
        note: '',
      });
    } else {
      existing.name = user.name;
    }
  }
  return [...registry.sales.values()];
}

interface Totals {
  total: number;
  documents: Set<string>;
}

/** Omzet bulan berjalan per penjual: baris penjualan POS dan Sales Order yang dibuat sales. */
function totalsBySeller(ctx: MasterContext): Map<string, Totals> {
  const state = ctx.store.getState();
  const month = wibDate(ctx.now()).slice(0, 7);
  const result = new Map<string, Totals>();
  const add = (id: string, amount: number, document: string): void => {
    const current = result.get(id) ?? { total: 0, documents: new Set<string>() };
    current.total += amount;
    current.documents.add(document);
    result.set(id, current);
  };
  for (const sale of state.data.sales) {
    if (wibDate(new Date(sale.createdAt)).slice(0, 7) !== month) {
      continue;
    }
    for (const line of sale.lines) {
      add(line.sellerId ?? sale.cashierId, lineSubtotal(line), sale.number);
    }
  }
  for (const order of state.salesOrders) {
    if (wibDate(new Date(order.createdAt)).slice(0, 7) === month) {
      add(order.createdBy, order.total, order.number);
    }
  }
  return result;
}

function buildRows(ctx: MasterContext): readonly MasterRow[] {
  const profiles = ensureProfiles(ctx);
  const totals = totalsBySeller(ctx);
  const users = ctx.store.getState().data.users;
  return profiles
    .map((profile): MasterRow => {
      const found = totals.get(profile.id);
      const revenue = found?.total ?? 0;
      const documents = found?.documents.size ?? 0;
      const commission = Math.round((revenue * profile.commission) / 100);
      const progress =
        profile.target > 0 ? Math.min(100, Math.round((revenue / profile.target) * 100)) : 0;
      const role = label(ROLE_LABELS[profile.role]);
      const account = users.find((user) => user.id === profile.id)?.username;
      const phone = profile.phone === '' ? '-' : profile.phone;
      const details: MasterDetail[] = [
        { label: 'masterFieldKode', value: profile.code },
        { label: 'masterFieldNama', value: profile.name },
        { label: 'masterFieldPeran', value: role },
        { label: 'masterFieldTelepon', value: phone },
        { label: 'masterFieldKomisi', value: `${percentText(profile.commission)}%` },
        { label: 'masterFieldTarget', value: formatRupiah(profile.target) },
        { label: 'masterFieldCatatan', value: profile.note === '' ? '-' : profile.note },
        { label: 'masterFieldAkun', value: account ?? '-' },
        { label: 'masterMetOmzet', value: formatRupiah(revenue) },
        { label: 'masterMetNota', value: formatDecimal(documents, 0) },
        { label: 'masterMetKomisiBulan', value: formatRupiah(commission) },
        { label: 'masterMetCapaian', value: `${formatDecimal(progress, 0)}%` },
      ];
      const metrics: MasterMetric[] = [
        { label: 'masterMetOmzet', value: formatRupiah(revenue) },
        { label: 'masterMetNota', value: formatDecimal(documents, 0) },
        { label: 'masterMetKomisiBulan', value: formatRupiah(commission) },
        { label: 'masterMetCapaian', value: `${formatDecimal(progress, 0)}%` },
      ];
      return {
        id: profile.id,
        title: profile.name,
        values: {
          code: profile.code,
          name: profile.name,
          role: profile.role,
          phone: profile.phone,
          commission: percentText(profile.commission),
          target: moneyText(profile.target),
          note: profile.note,
        },
        cells: {
          code: { text: profile.code },
          name: { text: profile.name, sub: `${role} · ${phone}` },
          commission: { text: `${percentText(profile.commission)}%` },
          target: { text: formatRupiah(profile.target) },
          revenue: { text: formatRupiah(revenue) },
        },
        details,
        metrics,
        usage: documents,
        progress,
        search: searchText([profile.code, profile.name, profile.phone, role, account]),
        lockedFields: profile.source === 'pengguna' ? ['name', 'role'] : [],
        inactive: false,
        sealed: false,
      };
    })
    .sort((first, second) => compareNames(first.title, second.title));
}

export const salesAdapter: KindAdapter = {
  rows: buildRows,
  stats: (ctx, rows) => {
    const totals = totalsBySeller(ctx);
    const revenue = rows.reduce((sum, row) => sum + (totals.get(row.id)?.total ?? 0), 0);
    const target = rows.reduce((sum, row) => sum + (parseMoney(row.values['target']) ?? 0), 0);
    return [
      { label: 'masterStatSales', value: formatDecimal(rows.length, 0) },
      { label: 'masterStatOmzet', value: formatRupiah(revenue) },
      { label: 'masterStatTarget', value: formatRupiah(target) },
    ];
  },
  defaults: (_ctx, rows) => ({
    code: nextCode(
      'SL',
      rows.map((row) => row.values['code'] ?? ''),
    ),
    name: '',
    role: 'sales',
    phone: '',
    commission: percentText(DEFAULT_COMMISSION.sales),
    target: moneyText(DEFAULT_TARGET.sales),
    note: '',
  }),
  validate: (values, _ctx, editing, rows) => {
    const others = rows.filter((row) => row.id !== editing?.id);
    const issues: MasterIssue[] = checkNameAndCode(values, {
      entity: label('masterEntitasSales'),
      nameRequired: 'MSG-110',
      codeTaken: (code) => others.some((row) => cleanCode(row.values['code']) === code),
      nameTaken: (name) => others.some((row) => sameText(row.title, name)),
    });
    issues.push(...checkPhone(values));
    issues.push(...checkLength(values, 'note', NOTE_MAX, 'masterErrKeteranganPanjang'));
    if (parsePercent(values['commission']) === undefined) {
      issues.push(issueLabel('commission', 'masterErrKomisi'));
    }
    if (parseMoney(values['target']) === undefined) {
      issues.push(issueLabel('target', 'masterErrAngka'));
    }
    if (!isSalesRole(values['role'])) {
      issues.push(issueLabel('role', 'masterErrPeran'));
    }
    return issues;
  },
  save: (values, ctx, editing) => {
    const registry = registryOf(ctx.store);
    const role = isSalesRole(values['role']) ? values['role'] : 'sales';
    const fields = {
      code: cleanCode(values['code']),
      phone: phoneOf(values['phone']),
      commission: parsePercent(values['commission']) ?? 0,
      target: parseMoney(values['target']) ?? 0,
      note: cleanText(values['note']),
    };
    const profile = editing === undefined ? undefined : registry.sales.get(editing.id);
    if (profile === undefined) {
      const next = Math.max(0, ...[...registry.sales.keys()].map((id) => numberIn(id))) + 1;
      const id = `SL-${pad(next, 3)}`;
      const name = cleanText(values['name']);
      registry.sales.set(id, { id, source: 'manual', name, role, ...fields });
      return { id, title: name };
    }
    Object.assign(profile, fields);
    if (profile.source === 'manual') {
      profile.name = cleanText(values['name']);
      profile.role = role;
    }
    return { id: profile.id, title: profile.name };
  },
  blocker: (row, ctx) => {
    if (registryOf(ctx.store).sales.get(row.id)?.source !== 'manual') {
      return { labelKey: 'masterTolakSalesPengguna', values: { nama: row.title } };
    }
    return row.usage > 0
      ? {
          labelKey: 'masterTolakSalesPakai',
          values: { nama: row.title, jumlah: formatDecimal(row.usage, 0) },
        }
      : undefined;
  },
  remove: (row, ctx) => {
    registryOf(ctx.store).sales.delete(row.id);
    return { restored: false };
  },
  samples: SAMPLES,
};
