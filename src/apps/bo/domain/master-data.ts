import type { Store } from '../../../shared/store/store';
import { label, message } from '../../../shared/messages';
import { catalogAdapter, catalogNames } from './master-catalog';
import { expeditionAdapter } from './master-expedition';
import { ADDRESS_MAX, CODE_MAX, NAME_MAX, NOTE_MAX, matchesQuery } from './master-fields';
import { customerAdapter, LIMIT_PERMISSION, supplierAdapter } from './master-party';
import { salesAdapter } from './master-sales';
import {
  MASTER_KINDS,
  type ColumnDef,
  type FieldDef,
  type ImportOutcome,
  type KindAdapter,
  type MasterConfig,
  type MasterBlock,
  type MasterContext,
  type MasterIssue,
  type MasterKind,
  type MasterMetric,
  type MasterRow,
  type MasterValues,
  type PermissionKey,
  type RemoveOutcome,
  type SaveOutcome,
} from './master-types';

export { MASTER_KINDS } from './master-types';
export type * from './master-types';

/**
 * Menghapus data master mengikuti hak "Nonaktifkan Barang" (hanya Owner): hapus bukan tindakan
 * harian, dan hak Supervisor tidak boleh melonggarkannya.
 */
const REMOVE: PermissionKey = { screen: 'BO-03', action: 'Nonaktifkan Barang' };

const CODE_FIELD: FieldDef = {
  key: 'code',
  label: 'masterFieldKode',
  type: 'text',
  span: 2,
  required: true,
  maxLength: CODE_MAX,
};

const PHONE_FIELD: FieldDef = {
  key: 'phone',
  label: 'masterFieldTelepon',
  type: 'tel',
  span: 3,
  maxLength: 16,
};

const ADDRESS_FIELD: FieldDef = {
  key: 'address',
  label: 'masterFieldAlamat',
  type: 'textarea',
  span: 6,
  maxLength: ADDRESS_MAX,
};

function nameField(labelKey: FieldDef['label']): FieldDef {
  return {
    key: 'name',
    label: labelKey,
    type: 'text',
    span: 4,
    required: true,
    maxLength: NAME_MAX,
  };
}

const NOTE_FIELD: FieldDef = {
  key: 'note',
  label: 'masterFieldKeterangan',
  type: 'textarea',
  span: 6,
  maxLength: NOTE_MAX,
};

const CODE_COLUMN: ColumnDef = { key: 'code', label: 'masterFieldKode' };

const TIER_OPTIONS = [
  { value: 'eceran', label: 'tierEceran' },
  { value: 'grosir', label: 'tierGrosir' },
  { value: 'kontraktor', label: 'tierKontraktor' },
] as const;

const ROLE_OPTIONS = [
  { value: 'sales', label: 'peranSales' },
  { value: 'frontliner', label: 'peranFrontliner' },
] as const;

export const MASTER_CONFIGS: Readonly<Record<MasterKind, MasterConfig>> = {
  kategori: {
    kind: 'kategori',
    screen: 'BO-03',
    menu: 'menuKategoriBarang',
    entity: 'masterEntitasKategori',
    icon: 'layout-grid',
    fields: [CODE_FIELD, nameField('masterFieldNamaKategori'), NOTE_FIELD],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaKategori' },
      { key: 'count', label: 'masterColBarang', align: 'end' },
      { key: 'related', label: 'masterColMerk', align: 'end' },
    ],
    add: { screen: 'BO-03', action: 'Tambah Barang' },
    edit: { screen: 'BO-03', action: 'Simpan Barang' },
    remove: REMOVE,
    importing: { screen: 'BO-03', action: 'Impor Excel' },
    removeStyle: 'hapus',
  },
  merk: {
    kind: 'merk',
    screen: 'BO-03',
    menu: 'menuMerkBarang',
    entity: 'masterEntitasMerk',
    icon: 'tag',
    fields: [CODE_FIELD, nameField('masterFieldNamaMerk'), NOTE_FIELD],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaMerk' },
      { key: 'count', label: 'masterColBarang', align: 'end' },
      { key: 'related', label: 'masterColKategori', align: 'end' },
    ],
    add: { screen: 'BO-03', action: 'Tambah Barang' },
    edit: { screen: 'BO-03', action: 'Simpan Barang' },
    remove: REMOVE,
    importing: { screen: 'BO-03', action: 'Impor Excel' },
    removeStyle: 'hapus',
  },
  pemasok: {
    kind: 'pemasok',
    screen: 'BO-08',
    menu: 'menuPemasok',
    entity: 'masterEntitasPemasok',
    icon: 'building-2',
    fields: [
      CODE_FIELD,
      nameField('masterFieldNamaPemasok'),
      { ...PHONE_FIELD, span: 6 },
      ADDRESS_FIELD,
    ],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaPemasok' },
      { key: 'address', label: 'masterFieldAlamat' },
      { key: 'balance', label: 'masterColHutang', align: 'end' },
    ],
    add: { screen: 'BO-08', action: 'Tab Pemasok: Tambah Pemasok' },
    edit: { screen: 'BO-08', action: 'Tab Pemasok: Tambah Pemasok' },
    remove: REMOVE,
    importing: { screen: 'BO-08', action: 'Tab Pemasok: Tambah Pemasok' },
    removeStyle: 'nonaktif',
  },
  pelanggan: {
    kind: 'pelanggan',
    screen: 'BO-11',
    menu: 'menuPelanggan',
    entity: 'masterEntitasPelanggan',
    icon: 'users',
    fields: [
      CODE_FIELD,
      nameField('masterFieldNamaPelanggan'),
      PHONE_FIELD,
      {
        key: 'tier',
        label: 'masterFieldTier',
        type: 'select',
        span: 3,
        required: true,
        options: TIER_OPTIONS,
      },
      ADDRESS_FIELD,
      {
        key: 'limit',
        label: 'masterFieldLimit',
        type: 'money',
        span: 3,
        permission: LIMIT_PERMISSION,
        hint: 'masterLimitHanyaOwner',
      },
      { key: 'dueDays', label: 'masterFieldTempo', type: 'integer', span: 3, maxLength: 3 },
    ],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaPelanggan' },
      { key: 'tier', label: 'masterColTier', badge: true },
      { key: 'limit', label: 'masterColLimit', align: 'end' },
      { key: 'balance', label: 'masterColPiutang', align: 'end' },
    ],
    add: { screen: 'BO-11', action: 'Tambah Pelanggan' },
    edit: { screen: 'BO-11', action: 'Tambah Pelanggan' },
    remove: REMOVE,
    importing: { screen: 'BO-11', action: 'Tambah Pelanggan' },
    removeStyle: 'nonaktif',
  },
  sales: {
    kind: 'sales',
    screen: 'BO-14',
    menu: 'menuSales',
    entity: 'masterEntitasSales',
    icon: 'user-check',
    fields: [
      CODE_FIELD,
      { ...nameField('masterFieldNamaSales'), hint: 'masterNamaMengikutiAkun' },
      PHONE_FIELD,
      {
        key: 'role',
        label: 'masterFieldPeran',
        type: 'select',
        span: 3,
        required: true,
        options: ROLE_OPTIONS,
      },
      { key: 'commission', label: 'masterFieldKomisi', type: 'decimal', span: 3, maxLength: 6 },
      { key: 'target', label: 'masterFieldTarget', type: 'money', span: 3 },
      { ...NOTE_FIELD, label: 'masterFieldCatatan' },
    ],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaSales' },
      { key: 'commission', label: 'masterColKomisi', align: 'end' },
      { key: 'target', label: 'masterColTarget', align: 'end' },
      { key: 'revenue', label: 'masterColOmzet', align: 'end' },
    ],
    add: { screen: 'BO-14', action: 'Tambah Aturan' },
    edit: { screen: 'BO-14', action: 'Simpan Aturan' },
    remove: REMOVE,
    importing: { screen: 'BO-14', action: 'Tambah Aturan' },
    removeStyle: 'hapus',
  },
  ekspedisi: {
    kind: 'ekspedisi',
    screen: 'BO-12',
    menu: 'menuEkspedisi',
    entity: 'masterEntitasEkspedisi',
    icon: 'truck',
    fields: [
      CODE_FIELD,
      nameField('masterFieldNamaEkspedisi'),
      PHONE_FIELD,
      { key: 'baseFee', label: 'masterFieldTarif', type: 'money', span: 3 },
      ADDRESS_FIELD,
      { ...NOTE_FIELD, label: 'masterFieldCatatan' },
    ],
    columns: [
      CODE_COLUMN,
      { key: 'name', label: 'masterFieldNamaEkspedisi' },
      { key: 'address', label: 'masterFieldAlamat' },
      { key: 'fee', label: 'masterColTarif', align: 'end' },
    ],
    add: { screen: 'BO-12', action: 'Simpan' },
    edit: { screen: 'BO-12', action: 'Simpan' },
    remove: REMOVE,
    importing: { screen: 'BO-12', action: 'Simpan' },
    removeStyle: 'hapus',
  },
};

const ADAPTERS: Readonly<Record<MasterKind, KindAdapter>> = {
  kategori: catalogAdapter('category'),
  merk: catalogAdapter('brand'),
  pemasok: supplierAdapter,
  pelanggan: customerAdapter,
  sales: salesAdapter,
  ekspedisi: expeditionAdapter,
};

export function isMasterKind(value: string): value is MasterKind {
  return MASTER_KINDS.some((kind) => kind === value);
}

export function buildRows(kind: MasterKind, ctx: MasterContext): readonly MasterRow[] {
  return ADAPTERS[kind].rows(ctx);
}

export function filterRows(rows: readonly MasterRow[], query: string): readonly MasterRow[] {
  return rows.filter((row) => matchesQuery(row.search, query));
}

export function masterStats(kind: MasterKind, ctx: MasterContext): readonly MasterMetric[] {
  const adapter = ADAPTERS[kind];
  return adapter.stats(ctx, adapter.rows(ctx));
}

export function newValues(kind: MasterKind, ctx: MasterContext): MasterValues {
  const adapter = ADAPTERS[kind];
  return adapter.defaults(ctx, adapter.rows(ctx));
}

/** Kolom formulir yang tidak boleh diubah (terkunci pada baris atau tanpa hak tambahan). */
export function lockedFields(
  kind: MasterKind,
  row: MasterRow | undefined,
  ctx: MasterContext,
): ReadonlySet<string> {
  const locked = new Set(row?.lockedFields ?? []);
  for (const field of MASTER_CONFIGS[kind].fields) {
    if (field.permission !== undefined && !ctx.allowed(field.permission)) {
      locked.add(field.key);
    }
  }
  return locked;
}

export function issueText(issue: MasterIssue): string {
  if (issue.messageId !== undefined) {
    return message(issue.messageId);
  }
  return label(issue.labelKey ?? 'masterErrUmum', issue.values);
}

export function validateRecord(
  kind: MasterKind,
  values: MasterValues,
  ctx: MasterContext,
  editing?: MasterRow,
): readonly MasterIssue[] {
  const adapter = ADAPTERS[kind];
  const rows = adapter.rows(ctx);
  return adapter.validate(
    values,
    ctx,
    rows.find((row) => row.id === editing?.id),
    rows,
  );
}

function logSave(kind: MasterKind, ctx: MasterContext, title: string, created: boolean): void {
  ctx.log(
    'koreksi',
    label(created ? 'masterLogTambah' : 'masterLogUbah', {
      entitas: label(MASTER_CONFIGS[kind].entity),
      nama: title,
    }),
  );
}

function saveUnchecked(
  kind: MasterKind,
  values: MasterValues,
  ctx: MasterContext,
  editing: MasterRow | undefined,
): SaveOutcome {
  const adapter = ADAPTERS[kind];
  const rows = adapter.rows(ctx);
  const current = rows.find((row) => row.id === editing?.id);
  const issues = adapter.validate(values, ctx, current, rows);
  if (issues.length > 0) {
    return { ok: false, denied: false, issues };
  }
  const saved = adapter.save(values, ctx, current, rows);
  return { ok: true, id: saved.id, title: saved.title, created: current === undefined };
}

export function saveRecord(
  kind: MasterKind,
  values: MasterValues,
  ctx: MasterContext,
  editing?: MasterRow,
): SaveOutcome {
  const config = MASTER_CONFIGS[kind];
  if (!ctx.allowed(editing === undefined ? config.add : config.edit)) {
    return { ok: false, denied: true };
  }
  const outcome = saveUnchecked(kind, values, ctx, editing);
  if (outcome.ok) {
    logSave(kind, ctx, outcome.title, outcome.created);
  }
  return outcome;
}

/** Alasan sebuah baris tidak boleh dihapus, untuk memeriksa sebelum meminta konfirmasi. */
export function removalBlock(
  kind: MasterKind,
  id: string,
  ctx: MasterContext,
): MasterBlock | undefined {
  const adapter = ADAPTERS[kind];
  const row = adapter.rows(ctx).find((item) => item.id === id);
  return row === undefined
    ? { labelKey: 'masterTolakBawaan', values: {} }
    : adapter.blocker(row, ctx);
}

export function removeRecord(kind: MasterKind, id: string, ctx: MasterContext): RemoveOutcome {
  const config = MASTER_CONFIGS[kind];
  if (!ctx.allowed(config.remove)) {
    return { ok: false, denied: true };
  }
  const adapter = ADAPTERS[kind];
  const row = adapter.rows(ctx).find((item) => item.id === id);
  if (row === undefined) {
    return { ok: false, denied: false, block: { labelKey: 'masterTolakBawaan', values: {} } };
  }
  const block = adapter.blocker(row, ctx);
  if (block !== undefined) {
    return { ok: false, denied: false, block };
  }
  const outcome = adapter.remove(row, ctx);
  const key =
    config.removeStyle === 'hapus'
      ? 'masterLogHapus'
      : outcome.restored
        ? 'masterLogAktif'
        : 'masterLogNonaktif';
  ctx.log('koreksi', label(key, { entitas: label(config.entity), nama: row.title }));
  return { ok: true, title: row.title, restored: outcome.restored };
}

/** Memuat contoh data (simulasi impor Excel); yang namanya atau kodenya sudah ada dilewati. */
export function importSamples(kind: MasterKind, ctx: MasterContext): ImportOutcome {
  const config = MASTER_CONFIGS[kind];
  if (!ctx.allowed(config.importing)) {
    return { ok: false, denied: true };
  }
  const adapter = ADAPTERS[kind];
  let added = 0;
  let skipped = 0;
  for (const sample of adapter.samples) {
    const defaults = adapter.defaults(ctx, adapter.rows(ctx));
    const sampleCode = sample['code'] ?? '';
    const values: MasterValues = {
      ...defaults,
      ...sample,
      code: sampleCode === '' ? (defaults['code'] ?? '') : sampleCode,
    };
    const outcome = saveUnchecked(kind, values, ctx, undefined);
    if (outcome.ok) {
      added += 1;
    } else {
      skipped += 1;
    }
  }
  if (added > 0) {
    ctx.log(
      'impor',
      label('masterLogImpor', { entitas: label(config.entity), jumlah: String(added) }),
    );
  }
  return { ok: true, added, skipped };
}

/** Nama contoh yang akan dimuat oleh simulasi impor, untuk ditampilkan sebelum konfirmasi. */
export function sampleNames(kind: MasterKind): string[] {
  return ADAPTERS[kind].samples.map((sample) => sample['name'] ?? '');
}

export interface ExportTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function exportTable(rows: readonly MasterRow[]): ExportTable {
  const first = rows[0];
  if (first === undefined) {
    return { columns: [], rows: [] };
  }
  return {
    columns: first.details.map((detail) => label(detail.label)),
    rows: rows.map((row) => row.details.map((detail) => detail.value)),
  };
}

export function listCategoryNames(store: Store): string[] {
  return catalogNames(store, 'category');
}

export function listBrandNames(store: Store): string[] {
  return catalogNames(store, 'brand');
}
