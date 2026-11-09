import type { ActivityKind } from '../../../shared/data/types';
import type { IconName } from '../../../shared/icons';
import type { LabelKey, MessageValues, SystemMessageId } from '../../../shared/messages';
import type { Store } from '../../../shared/store/store';

export const MASTER_KINDS = [
  'kategori',
  'merk',
  'pemasok',
  'pelanggan',
  'sales',
  'ekspedisi',
] as const;

export type MasterKind = (typeof MASTER_KINDS)[number];

/** Nilai formulir selalu berupa teks; dikonversi oleh adaptor tiap entitas saat disimpan. */
export type MasterValues = Readonly<Record<string, string>>;

export type MasterTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface PermissionKey {
  readonly screen: string;
  readonly action: string;
}

export interface MasterContext {
  readonly store: Store;
  readonly now: () => Date;
  readonly allowed: (permission: PermissionKey) => boolean;
  readonly log: (kind: ActivityKind, detail: string) => void;
}

export type FieldType = 'text' | 'textarea' | 'select' | 'tel' | 'money' | 'decimal' | 'integer';

export interface FieldOption {
  readonly value: string;
  readonly label: LabelKey;
}

export interface FieldDef {
  readonly key: string;
  readonly label: LabelKey;
  readonly type: FieldType;
  /** Lebar pada grid formulir enam kolom. */
  readonly span: 2 | 3 | 4 | 6;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly options?: readonly FieldOption[];
  /** Hak tambahan yang diperlukan untuk mengubah kolom ini (mis. Ubah Limit). */
  readonly permission?: PermissionKey;
  readonly hint?: LabelKey;
}

export interface ColumnDef {
  readonly key: string;
  readonly label: LabelKey;
  readonly align?: 'end';
  readonly badge?: boolean;
}

export interface MasterFlag {
  readonly text: string;
  readonly tone: MasterTone;
}

export interface MasterCell {
  readonly text: string;
  /** Baris kedua yang lebih redup di bawah teks utama (mis. nomor telepon). */
  readonly sub?: string | undefined;
  /** Nada lencana bila kolomnya bertipe lencana. */
  readonly tone?: MasterTone | undefined;
  /** Lencana kecil di samping teks utama (mis. Nonaktif atau Lewat tempo). */
  readonly flag?: MasterFlag | undefined;
}

export interface MasterMetric {
  readonly label: LabelKey;
  readonly value: string;
  readonly tone?: MasterTone | undefined;
}

export interface MasterDetail {
  readonly label: LabelKey;
  readonly value: string;
}

export interface MasterRow {
  readonly id: string;
  /** Nama yang dipakai pada pesan, mis. nama kategori. */
  readonly title: string;
  readonly values: MasterValues;
  readonly cells: Readonly<Record<string, MasterCell>>;
  readonly details: readonly MasterDetail[];
  readonly metrics: readonly MasterMetric[];
  /** Berapa banyak data lain yang memakai baris ini (barang, faktur, transaksi). */
  readonly usage: number;
  /** Capaian 0 sampai 100 untuk batang kemajuan (hanya Sales), selain itu undefined. */
  readonly progress: number | undefined;
  readonly search: string;
  /** Kolom formulir yang tidak boleh diubah pada baris ini. */
  readonly lockedFields: readonly string[];
  readonly inactive: boolean;
  /** Baris bawaan yang tidak boleh diubah sama sekali. */
  readonly sealed: boolean;
}

export interface MasterIssue {
  readonly field: string;
  readonly messageId?: SystemMessageId;
  readonly labelKey?: LabelKey;
  readonly values?: MessageValues;
}

export interface MasterBlock {
  readonly labelKey: LabelKey;
  readonly values: MessageValues;
}

export type SaveOutcome =
  | { readonly ok: true; readonly id: string; readonly title: string; readonly created: boolean }
  | { readonly ok: false; readonly denied: true }
  | { readonly ok: false; readonly denied: false; readonly issues: readonly MasterIssue[] };

export type RemoveOutcome =
  | { readonly ok: true; readonly title: string; readonly restored: boolean }
  | { readonly ok: false; readonly denied: true }
  | { readonly ok: false; readonly denied: false; readonly block: MasterBlock };

export type ImportOutcome =
  | { readonly ok: true; readonly added: number; readonly skipped: number }
  | { readonly ok: false; readonly denied: true };

export interface MasterConfig {
  readonly kind: MasterKind;
  /** Id layar pada matriks hak akses, mis. BO-03. */
  readonly screen: string;
  readonly menu: LabelKey;
  readonly entity: LabelKey;
  readonly icon: IconName;
  readonly fields: readonly FieldDef[];
  readonly columns: readonly ColumnDef[];
  readonly add: PermissionKey;
  readonly edit: PermissionKey;
  readonly remove: PermissionKey;
  readonly importing: PermissionKey;
  /** hapus: data dibuang; nonaktif: data tetap tetapi ditandai tidak aktif. */
  readonly removeStyle: 'hapus' | 'nonaktif';
}

/** Perilaku khusus tiap entitas; fasad pada master-data.ts memanggil adaptor yang sesuai. */
export interface KindAdapter {
  rows(ctx: MasterContext): readonly MasterRow[];
  stats(ctx: MasterContext, rows: readonly MasterRow[]): readonly MasterMetric[];
  defaults(ctx: MasterContext, rows: readonly MasterRow[]): MasterValues;
  validate(
    values: MasterValues,
    ctx: MasterContext,
    editing: MasterRow | undefined,
    rows: readonly MasterRow[],
  ): readonly MasterIssue[];
  save(
    values: MasterValues,
    ctx: MasterContext,
    editing: MasterRow | undefined,
    rows: readonly MasterRow[],
  ): { readonly id: string; readonly title: string };
  /** Alasan baris tidak boleh dihapus atau dinonaktifkan; undefined bila boleh. */
  blocker(row: MasterRow, ctx: MasterContext): MasterBlock | undefined;
  /** Menghapus atau menonaktifkan (pemanggil sudah memastikan blocker kosong). */
  remove(row: MasterRow, ctx: MasterContext): { readonly restored: boolean };
  readonly samples: readonly MasterValues[];
}
