import { wibDate } from '../../../../shared/data/receivable';
import type { Tier, WarehouseId } from '../../../../shared/data/types';
import type { BoSession } from '../../bo-session';
import type { ReportKind } from '../../domain/menu';
import {
  buildDebtReport,
  buildDocReport,
  buildGrossProfitReport,
  buildPriceList,
  buildStockReport,
  monthStartOf,
  type ReportMode,
} from '../../domain/reports';
import { movementSourcesFor } from '../../movement-sources';
import { ensurePayments } from '../debt/ledger';
import { openReportDialog, type Choice, type DialogSpec, type DialogValues } from './dialog';

const ALL: Choice = { value: '', text: 'Semua' };

const MODES: readonly Choice[] = [
  { value: 'summary', text: 'Summary' },
  { value: 'perincian', text: 'Perincian' },
  { value: 'total', text: 'Total' },
];

function names(values: readonly string[]): Choice[] {
  return [
    ALL,
    ...[...new Set(values.filter((value) => value !== ''))]
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map((value) => ({ value, text: value })),
  ];
}

function flag(values: DialogValues, id: string): boolean {
  return values[id] === 'true';
}

// Kotak pilihan enam laporan (gambar klien 29). Tiap laporan menyusun spesifikasi dari data sesi.
export function openReport(kind: ReportKind, session: BoSession): void {
  const state = session.store.getState();
  const data = state.data;
  const today = wibDate(session.now());
  const owner = state.role === 'owner';
  const base = { defaultFrom: monthStartOf(today), defaultTo: today } as const;
  const period = (values: DialogValues): { from: string; to: string } => ({
    from: values['periodFrom'] ?? '',
    to: values['periodTo'] ?? '',
  });
  const categories = names(data.products.map((product) => product.category));
  const brands = names(data.products.map((product) => product.brand));
  const customers = names(
    data.customers.filter((item) => item.active !== false).map((item) => item.name),
  );
  const suppliers = names(
    data.suppliers.filter((item) => item.active !== false).map((item) => item.name),
  );
  const mode = (values: DialogValues): ReportMode =>
    (values['mode'] as ReportMode | undefined) ?? 'summary';
  const warehouse = (values: DialogValues): '' | WarehouseId =>
    (values['warehouse'] as '' | WarehouseId | undefined) ?? '';

  const specs: Readonly<Record<ReportKind, DialogSpec>> = {
    penjualan: {
      ...base,
      title: 'Laporan Penjualan',
      items: [
        { type: 'radios', id: 'mode', options: MODES, value: 'summary' },
        { type: 'period', id: 'period', label: 'Tanggal Faktur' },
        { type: 'select', id: 'party', label: 'Pelanggan', options: customers, value: '' },
        {
          type: 'select',
          id: 'tier',
          label: 'Kategori Pelanggan',
          options: [ALL, { value: 'eceran', text: 'Eceran' }, { value: 'grosir', text: 'Grosir' }],
          value: '',
        },
        { type: 'text', id: 'product', label: 'Nama Barang', placeholder: 'Semua' },
        {
          type: 'select',
          id: 'category',
          label: 'Kategori Barang',
          options: categories,
          value: '',
        },
        { type: 'select', id: 'brand', label: 'Merk Barang', options: brands, value: '' },
        {
          type: 'select',
          id: 'saleType',
          label: 'Tipe Penjualan',
          options: [ALL, { value: 'pos', text: 'POS' }, { value: 'bo', text: 'Back Office' }],
          value: '',
        },
        {
          type: 'select',
          id: 'kind',
          label: 'Jenis Transaksi',
          options: [ALL, { value: 'tunai', text: 'Tunai' }, { value: 'piutang', text: 'Piutang' }],
          value: '',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status Pembayaran',
          options: [
            ALL,
            { value: 'lunas', text: 'Lunas' },
            { value: 'belum-lunas', text: 'Belum Lunas' },
          ],
          value: '',
        },
        {
          type: 'select',
          id: 'seller',
          label: 'Sales',
          options: [
            ALL,
            ...data.users
              .filter((user) => user.active)
              .map((user) => ({ value: user.id, text: user.name })),
          ],
          value: '',
        },
        { type: 'check', id: 'commission', label: 'Komisi Sales', value: false },
      ],
      build: (values) =>
        buildDocReport(data, false, {
          mode: mode(values),
          period: period(values),
          party: values['party'] ?? '',
          tier: (values['tier'] ?? '') as '' | Tier,
          product: values['product'] ?? '',
          category: values['category'] ?? '',
          brand: values['brand'] ?? '',
          saleType: (values['saleType'] ?? '') as '' | 'pos' | 'bo',
          kind: (values['kind'] ?? '') as '' | 'tunai' | 'piutang',
          status: (values['status'] ?? '') as '' | 'lunas' | 'belum-lunas',
          seller: values['seller'] ?? '',
          commission: flag(values, 'commission'),
        }),
    },
    pembelian: {
      ...base,
      title: 'Laporan Pembelian',
      items: [
        { type: 'radios', id: 'mode', options: MODES, value: 'summary' },
        { type: 'period', id: 'period', label: 'Tanggal Faktur' },
        { type: 'select', id: 'party', label: 'Pemasok', options: suppliers, value: '' },
        { type: 'text', id: 'product', label: 'Nama Barang', placeholder: 'Semua' },
        {
          type: 'select',
          id: 'category',
          label: 'Kategori Barang',
          options: categories,
          value: '',
        },
        { type: 'select', id: 'brand', label: 'Merk Barang', options: brands, value: '' },
        {
          type: 'select',
          id: 'kind',
          label: 'Jenis Transaksi',
          options: [ALL, { value: 'tunai', text: 'Tunai' }, { value: 'piutang', text: 'Hutang' }],
          value: '',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status Pembayaran',
          options: [
            ALL,
            { value: 'lunas', text: 'Lunas' },
            { value: 'belum-lunas', text: 'Belum Lunas' },
          ],
          value: '',
        },
      ],
      build: (values) =>
        buildDocReport(data, true, {
          mode: mode(values),
          period: period(values),
          party: values['party'] ?? '',
          tier: '',
          product: values['product'] ?? '',
          category: values['category'] ?? '',
          brand: values['brand'] ?? '',
          saleType: '',
          kind: (values['kind'] ?? '') as '' | 'tunai' | 'piutang',
          status: (values['status'] ?? '') as '' | 'lunas' | 'belum-lunas',
          seller: '',
          commission: false,
        }),
    },
    'laba-rugi-kotor': {
      ...base,
      title: 'Laporan Laba Rugi Kotor',
      items: [
        { type: 'radios', id: 'mode', options: MODES, value: 'summary' },
        { type: 'period', id: 'period', label: 'Tanggal' },
        { type: 'select', id: 'party', label: 'Pelanggan', options: customers, value: '' },
        { type: 'text', id: 'product', label: 'Nama Barang', placeholder: 'Semua' },
        {
          type: 'select',
          id: 'category',
          label: 'Kategori Barang',
          options: categories,
          value: '',
        },
        { type: 'select', id: 'brand', label: 'Merk Barang', options: brands, value: '' },
      ],
      build: (values) =>
        buildGrossProfitReport(data, {
          mode: mode(values),
          period: period(values),
          customer: values['party'] ?? '',
          product: values['product'] ?? '',
          category: values['category'] ?? '',
          brand: values['brand'] ?? '',
        }),
    },
    'hutang-piutang': {
      ...base,
      title: 'Laporan Hutang Piutang',
      items: [
        {
          type: 'radios',
          id: 'side',
          options: [
            { value: 'hutang', text: 'Hutang' },
            { value: 'piutang', text: 'Piutang' },
          ],
          value: 'hutang',
        },
        {
          type: 'radios',
          id: 'mode',
          options: [
            { value: 'kartu', text: 'Kartu' },
            { value: 'perincian', text: 'Perincian' },
            { value: 'pembayaran', text: 'Pembayaran' },
          ],
          value: 'kartu',
        },
        { type: 'period', id: 'period', label: 'Tanggal' },
        {
          type: 'select',
          id: 'party',
          label: 'Pelanggan / Pemasok',
          options: [ALL, ...customers.slice(1), ...suppliers.slice(1)],
          value: '',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status Pembayaran',
          options: [
            ALL,
            { value: 'lunas', text: 'Lunas' },
            { value: 'belum-lunas', text: 'Belum Lunas' },
          ],
          value: '',
        },
      ],
      build: (values) =>
        buildDebtReport(data, ensurePayments(session), {
          side: values['side'] === 'piutang' ? 'piutang' : 'hutang',
          mode:
            values['mode'] === 'perincian' || values['mode'] === 'pembayaran'
              ? values['mode']
              : 'kartu',
          period: period(values),
          party: values['party'] ?? '',
          status: (values['status'] ?? '') as '' | 'lunas' | 'belum-lunas',
        }),
    },
    stok: {
      ...base,
      title: 'Laporan Stok Barang',
      items: [
        {
          type: 'radios',
          id: 'mode',
          options: [
            { value: 'nilai', text: 'Nilai Persediaan' },
            { value: 'kartu', text: 'Kartu Stok Persediaan' },
          ],
          value: 'nilai',
        },
        { type: 'period', id: 'period', label: 'Tanggal' },
        { type: 'text', id: 'product', label: 'Nama Barang', placeholder: 'Semua' },
        {
          type: 'select',
          id: 'category',
          label: 'Kategori Barang',
          options: categories,
          value: '',
        },
        { type: 'select', id: 'brand', label: 'Merk Barang', options: brands, value: '' },
        {
          type: 'select',
          id: 'warehouse',
          label: 'Gudang',
          options: [ALL, { value: 'display', text: 'Toko' }, { value: 'besar', text: 'Gudang' }],
          value: '',
        },
      ],
      build: (values) =>
        buildStockReport(data, movementSourcesFor(session), {
          mode: values['mode'] === 'kartu' ? 'kartu' : 'nilai',
          period: period(values),
          product: values['product'] ?? '',
          category: values['category'] ?? '',
          brand: values['brand'] ?? '',
          warehouse: warehouse(values),
          showHpp: owner,
        }),
    },
    harga: {
      ...base,
      title: 'Cetak Daftar Harga dan Katalog Barang',
      items: [
        {
          type: 'radios',
          id: 'mode',
          options: [
            { value: 'harga', text: 'Daftar Harga' },
            { value: 'katalog', text: 'Katalog Barang' },
          ],
          value: 'harga',
        },
        { type: 'text', id: 'phrase', label: 'Frase Nama Barang', placeholder: 'Semua' },
        {
          type: 'select',
          id: 'category',
          label: 'Kategori Barang',
          options: categories,
          value: '',
        },
        { type: 'select', id: 'brand', label: 'Merk Barang', options: brands, value: '' },
        {
          type: 'select',
          id: 'warehouse',
          label: 'Gudang',
          options: [ALL, { value: 'display', text: 'Toko' }, { value: 'besar', text: 'Gudang' }],
          value: '',
        },
        {
          type: 'checks',
          items: [
            { id: 'retail', label: 'Harga Eceran', value: true },
            { id: 'wholesale', label: 'Harga Grosir', value: true },
            ...(owner ? [{ id: 'hpp', label: 'Tampilkan Hpp', value: false }] : []),
          ],
        },
        {
          type: 'radios',
          id: 'units',
          options: [
            { value: 'dasar', text: 'Satuan Dasar' },
            { value: 'semua', text: 'Semua Satuan' },
          ],
          value: 'dasar',
        },
        {
          type: 'radios',
          id: 'stock',
          options: [
            { value: 'pakai', text: 'Pakai Qty Stok' },
            { value: 'tanpa', text: 'Tanpa Qty Stok' },
          ],
          value: 'pakai',
        },
      ],
      build: (values) =>
        buildPriceList(data, {
          mode: values['mode'] === 'katalog' ? 'katalog' : 'harga',
          phrase: values['phrase'] ?? '',
          category: values['category'] ?? '',
          brand: values['brand'] ?? '',
          warehouse: warehouse(values),
          retail: flag(values, 'retail'),
          wholesale: flag(values, 'wholesale'),
          showHpp: owner && flag(values, 'hpp'),
          allUnits: values['units'] === 'semua',
          withStock: values['stock'] !== 'tanpa',
        }),
    },
  };
  openReportDialog(specs[kind]);
}
