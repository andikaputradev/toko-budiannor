import type { Product } from '../../../shared/data/types';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import type { Store } from '../../../shared/store/store';
import {
  NOTE_MAX,
  checkLength,
  checkNameAndCode,
  cleanCode,
  cleanText,
  compareNames,
  issueLabel,
  nextCode,
  sameText,
  searchText,
} from './master-fields';
import { registryOf, type CatalogMeta } from './master-registry';
import type {
  KindAdapter,
  MasterContext,
  MasterDetail,
  MasterIssue,
  MasterMetric,
  MasterRow,
  MasterValues,
} from './master-types';

/** Kategori dan merk sama-sama berasal dari teks pada barang, jadi satu adaptor melayani keduanya. */
export type CatalogKey = 'category' | 'brand';

interface Aggregate {
  count: number;
  active: number;
  stock: number;
  value: number;
  related: Set<string>;
}

interface CatalogLabels {
  readonly entity: LabelKey;
  readonly stat: LabelKey;
  readonly related: LabelKey;
  readonly refuse: LabelKey;
  readonly prefix: string;
}

const LABELS: Readonly<Record<CatalogKey, CatalogLabels>> = {
  category: {
    entity: 'masterEntitasKategori',
    stat: 'masterStatKategori',
    related: 'masterMetMerk',
    refuse: 'masterTolakKategori',
    prefix: 'KT',
  },
  brand: {
    entity: 'masterEntitasMerk',
    stat: 'masterStatMerk',
    related: 'masterMetKategori',
    refuse: 'masterTolakMerk',
    prefix: 'MK',
  },
};

const NO_BRAND = new Set(['', '-']);

const SAMPLES: Readonly<Record<CatalogKey, readonly MasterValues[]>> = {
  category: [
    { name: 'Peralatan Kebun', code: '', note: 'Cangkul, sekop, dan selang taman' },
    { name: 'Sanitair', code: '', note: 'Kloset, wastafel, dan keran' },
    { name: 'Alat Ukur', code: '', note: 'Meteran, waterpass, dan jangka sorong' },
    { name: 'Perlengkapan Dapur', code: '', note: 'Kitchen sink dan aksesoris' },
  ],
  brand: [
    { name: 'Mulia Prima', code: '', note: 'Keramik dan granit' },
    { name: 'Kokoh Jaya', code: '', note: 'Perkakas tangan' },
    { name: 'Tiga Pilar', code: '', note: 'Cat dan pelapis' },
    { name: 'Nusa Bangun', code: '', note: 'Material bangunan' },
  ],
};

function valueOf(product: Product, key: CatalogKey): string {
  return cleanText(key === 'category' ? product.category : product.brand);
}

function otherOf(product: Product, key: CatalogKey): string {
  return cleanText(key === 'category' ? product.brand : product.category);
}

function metaOf(store: Store, key: CatalogKey): Map<string, CatalogMeta> {
  const registry = registryOf(store);
  return key === 'category' ? registry.categories : registry.brands;
}

function aggregate(products: readonly Product[], key: CatalogKey): Map<string, Aggregate> {
  const groups = new Map<string, Aggregate>();
  for (const product of products) {
    const name = valueOf(product, key);
    let group = groups.get(name);
    if (group === undefined) {
      group = { count: 0, active: 0, stock: 0, value: 0, related: new Set() };
      groups.set(name, group);
    }
    const stock = Math.max(0, product.stock.display + product.stock.besar);
    group.count += 1;
    group.active += product.active === false ? 0 : 1;
    group.stock += stock;
    group.value += stock * product.hpp;
    group.related.add(otherOf(product, key));
  }
  return groups;
}

/** Nama kategori atau merk yang tersedia: dipakai barang atau dibuat dari layar master. */
export function catalogNames(store: Store, key: CatalogKey): string[] {
  const names = new Set<string>(metaOf(store, key).keys());
  for (const product of store.getState().data.products) {
    names.add(valueOf(product, key));
  }
  return [...names].filter((name) => key === 'category' || !NO_BRAND.has(name)).sort(compareNames);
}

function buildRows(ctx: MasterContext, key: CatalogKey): readonly MasterRow[] {
  const spec = LABELS[key];
  const groups = aggregate(ctx.store.getState().data.products, key);
  const meta = metaOf(ctx.store, key);
  const names = [...new Set([...groups.keys(), ...meta.keys()])].sort(compareNames);
  const used = [...meta.values()].map((item) => item.code);
  for (const name of names) {
    if (!meta.has(name)) {
      const code = nextCode(spec.prefix, used);
      used.push(code);
      meta.set(name, { code, note: '' });
    }
  }
  return names.map((name): MasterRow => {
    const group = groups.get(name);
    const info = meta.get(name) ?? { code: '', note: '' };
    const sealed = key === 'brand' && NO_BRAND.has(name);
    const title = sealed ? label('masterTanpaMerk') : name;
    const count = group?.count ?? 0;
    const related = formatDecimal(group?.related.size ?? 0, 0);
    const stock = formatDecimal(Math.round((group?.stock ?? 0) * 100) / 100, 2);
    const value = formatRupiah(Math.round(group?.value ?? 0));
    const details: MasterDetail[] = [
      { label: 'masterFieldKode', value: info.code },
      { label: 'masterFieldNama', value: title },
      { label: 'masterFieldKeterangan', value: info.note === '' ? '-' : info.note },
      { label: 'masterMetBarang', value: formatDecimal(count, 0) },
      { label: 'masterMetBarangAktif', value: formatDecimal(group?.active ?? 0, 0) },
      { label: 'masterMetStok', value: stock },
      { label: 'masterMetNilai', value },
      { label: spec.related, value: related },
    ];
    const metrics: MasterMetric[] = [
      { label: 'masterMetBarang', value: formatDecimal(count, 0) },
      { label: spec.related, value: related },
      { label: 'masterMetStok', value: stock },
      { label: 'masterMetNilai', value },
    ];
    return {
      id: name,
      title,
      values: { name: title, code: info.code, note: info.note },
      cells: {
        code: { text: info.code },
        name: { text: title, sub: info.note === '' ? undefined : info.note },
        count: { text: formatDecimal(count, 0) },
        related: { text: related },
      },
      details,
      metrics,
      usage: count,
      progress: undefined,
      search: searchText([title, info.code, info.note]),
      lockedFields: [],
      inactive: false,
      sealed,
    };
  });
}

export function catalogAdapter(key: CatalogKey): KindAdapter {
  const spec = LABELS[key];
  return {
    rows: (ctx) => buildRows(ctx, key),
    stats: (ctx, rows) => [
      { label: spec.stat, value: formatDecimal(rows.length, 0) },
      {
        label: 'masterStatBarang',
        value: formatDecimal(ctx.store.getState().data.products.length, 0),
      },
      {
        label: 'masterStatKosong',
        value: formatDecimal(rows.filter((row) => row.usage === 0 && !row.sealed).length, 0),
      },
    ],
    defaults: (_ctx, rows) => ({
      name: '',
      code: nextCode(
        spec.prefix,
        rows.map((row) => row.values['code'] ?? ''),
      ),
      note: '',
    }),
    validate: (values, _ctx, editing, rows) => {
      const others = rows.filter((row) => row.id !== editing?.id);
      const issues: MasterIssue[] = checkNameAndCode(values, {
        entity: label(spec.entity),
        nameRequired: 'MSG-110',
        codeTaken: (code) => others.some((row) => cleanCode(row.values['code']) === code),
        nameTaken: (name) => others.some((row) => sameText(row.title, name)),
      });
      issues.push(...checkLength(values, 'note', NOTE_MAX, 'masterErrKeteranganPanjang'));
      if (editing?.sealed === true) {
        issues.push(issueLabel('name', 'masterTolakBawaan'));
      }
      return issues;
    },
    save: (values, ctx, editing) => {
      const name = cleanText(values['name']);
      const info: CatalogMeta = {
        code: cleanCode(values['code']),
        note: cleanText(values['note']),
      };
      const meta = metaOf(ctx.store, key);
      if (editing !== undefined && editing.id !== name) {
        for (const product of ctx.store.getState().data.products) {
          if (valueOf(product, key) === editing.id) {
            ctx.store.saveProduct(
              key === 'category' ? { ...product, category: name } : { ...product, brand: name },
            );
          }
        }
        meta.delete(editing.id);
      }
      meta.set(name, info);
      return { id: name, title: name };
    },
    blocker: (row) => {
      if (row.sealed) {
        return { labelKey: 'masterTolakBawaan', values: {} };
      }
      return row.usage > 0
        ? {
            labelKey: spec.refuse,
            values: { nama: row.title, jumlah: formatDecimal(row.usage, 0) },
          }
        : undefined;
    },
    remove: (row, ctx) => {
      metaOf(ctx.store, key).delete(row.id);
      return { restored: false };
    },
    samples: SAMPLES[key],
  };
}
