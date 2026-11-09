import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import {
  ADDRESS_MAX,
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
  phoneOf,
  sameText,
  searchText,
} from './master-fields';
import { registryOf, type ExpeditionRecord } from './master-registry';
import type {
  KindAdapter,
  MasterDetail,
  MasterIssue,
  MasterMetric,
  MasterRow,
  MasterValues,
} from './master-types';

const SAMPLES: readonly MasterValues[] = [
  {
    name: 'Sinar Kargo Nusantara',
    code: '',
    phone: '081355500611',
    address: 'Jl. Raya Kalianak No. 77, Surabaya',
    baseFee: '135.000',
    note: 'Cargo darat tujuan Jawa Timur',
  },
  {
    name: 'Kilat Antar Logistik',
    code: '',
    phone: '081355500612',
    address: 'Jl. Tanjungsari No. 15, Surabaya',
    baseFee: '160.000',
    note: 'Pengiriman proyek dan barang berat',
  },
];

function dash(text: string): string {
  return text === '' ? '-' : text;
}

function rowOf(record: ExpeditionRecord): MasterRow {
  const fee = formatRupiah(record.baseFee);
  const startup = label(record.builtIn ? 'masterYa' : 'masterTidak');
  const details: MasterDetail[] = [
    { label: 'masterFieldKode', value: record.code },
    { label: 'masterFieldNama', value: record.name },
    { label: 'masterFieldTelepon', value: dash(record.phone) },
    { label: 'masterFieldAlamat', value: dash(record.address) },
    { label: 'masterFieldTarif', value: fee },
    { label: 'masterFieldCatatan', value: dash(record.note) },
    { label: 'masterMetPilihanAwal', value: startup },
  ];
  const metrics: MasterMetric[] = [
    { label: 'masterFieldTarif', value: fee },
    { label: 'masterMetPilihanAwal', value: startup },
  ];
  return {
    id: record.id,
    title: record.name,
    values: {
      code: record.code,
      name: record.name,
      phone: record.phone,
      address: record.address,
      baseFee: moneyText(record.baseFee),
      note: record.note,
    },
    cells: {
      code: { text: record.code },
      name: {
        text: record.name,
        sub: dash(record.phone),
        flag: record.builtIn ? { text: label('masterBadgeBawaan'), tone: 'neutral' } : undefined,
      },
      address: { text: dash(record.address) },
      fee: { text: fee },
    },
    details,
    metrics,
    usage: record.builtIn ? 1 : 0,
    progress: undefined,
    search: searchText([record.code, record.name, record.phone, record.address, record.note]),
    lockedFields: [],
    inactive: false,
    sealed: false,
  };
}

export const expeditionAdapter: KindAdapter = {
  rows: (ctx) =>
    [...registryOf(ctx.store).expeditions.values()]
      .map(rowOf)
      .sort((first, second) => compareNames(first.title, second.title)),
  stats: (ctx) => {
    const fees = [...registryOf(ctx.store).expeditions.values()].map((item) => item.baseFee);
    return [
      { label: 'masterStatEkspedisi', value: formatDecimal(fees.length, 0) },
      {
        label: 'masterStatTarifRendah',
        value: formatRupiah(fees.length === 0 ? 0 : Math.min(...fees)),
      },
      {
        label: 'masterStatTarifTinggi',
        value: formatRupiah(fees.length === 0 ? 0 : Math.max(...fees)),
      },
    ];
  },
  defaults: (_ctx, rows) => ({
    code: nextCode(
      'EX',
      rows.map((row) => row.values['code'] ?? ''),
    ),
    name: '',
    phone: '',
    address: '',
    baseFee: '0',
    note: '',
  }),
  validate: (values, _ctx, editing, rows) => {
    const others = rows.filter((row) => row.id !== editing?.id);
    const issues: MasterIssue[] = checkNameAndCode(values, {
      entity: label('masterEntitasEkspedisi'),
      nameRequired: 'MSG-110',
      codeTaken: (code) => others.some((row) => cleanCode(row.values['code']) === code),
      nameTaken: (name) => others.some((row) => sameText(row.title, name)),
    });
    issues.push(...checkPhone(values));
    issues.push(...checkLength(values, 'address', ADDRESS_MAX, 'masterErrAlamatPanjang'));
    issues.push(...checkLength(values, 'note', NOTE_MAX, 'masterErrKeteranganPanjang'));
    if (parseMoney(values['baseFee']) === undefined) {
      issues.push(issueLabel('baseFee', 'masterErrAngka'));
    }
    return issues;
  },
  save: (values, ctx, editing) => {
    const registry = registryOf(ctx.store);
    const fields = {
      code: cleanCode(values['code']),
      name: cleanText(values['name']),
      phone: phoneOf(values['phone']),
      address: cleanText(values['address']),
      baseFee: parseMoney(values['baseFee']) ?? 0,
      note: cleanText(values['note']),
    };
    const record = editing === undefined ? undefined : registry.expeditions.get(editing.id);
    if (record === undefined) {
      const next = Math.max(0, ...[...registry.expeditions.keys()].map((id) => numberIn(id))) + 1;
      const id = `EX-${pad(next, 3)}`;
      registry.expeditions.set(id, { id, builtIn: false, ...fields });
      return { id, title: fields.name };
    }
    Object.assign(record, fields);
    return { id: record.id, title: record.name };
  },
  blocker: (row, ctx) =>
    registryOf(ctx.store).expeditions.get(row.id)?.builtIn === true
      ? { labelKey: 'masterTolakEkspedisi', values: { nama: row.title } }
      : undefined,
  remove: (row, ctx) => {
    registryOf(ctx.store).expeditions.delete(row.id);
    return { restored: false };
  },
  samples: SAMPLES,
};
