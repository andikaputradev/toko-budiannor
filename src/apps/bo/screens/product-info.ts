import { el, nextId } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import type { Product } from '../../../shared/data/types';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { openModal } from '../../../shared/ui/modal';
import type { BoSession } from '../bo-session';
import {
  buildMutationHistory,
  buildProductHistory,
  defaultRange,
  filterByParty,
  normalizeRange,
  type HistoryRange,
  type MutationHistoryRow,
  type ProductHistory,
} from '../domain/product-history';
import { ledgerFor } from '../domain/stock-correction';
import type { WarehouseFilter } from '../domain/stock-view';
import { movementSourcesFor } from '../movement-sources';

// Teks modal ini hanya dipakai di sini, jadi ikut dimuat malas bersama layar Data Barang (label
// bersama dimuat semua aplikasi dan anggaran JS POS hampir habis).
const TEXT = {
  judul: 'Data Histori Barang',
  sampaiDengan: 's/d',
  pemasok: 'Pemasok',
  pelanggan: 'Pelanggan',
  gudang: 'Gudang',
  tabMutasi: 'Mutasi',
  semuaGudang: 'Semua Gudang',
  toko: 'Toko',
  gudangBesar: 'Gudang Besar',
  tambah: 'TAMBAH',
  kurang: 'KURANG',
  satuanDasar: 'Jumlah dalam satuan dasar: {satuan}',
} as const;

const KIND_TEXT: Readonly<Record<MutationHistoryRow['kind'], string>> = {
  'saldo-awal': 'SALDO AWAL',
  pembelian: 'PEMBELIAN',
  penjualan: 'PENJUALAN',
  mutasi: 'TRANSFER',
  koreksi: 'KOREKSI',
  opname: 'OPNAME',
  'retur-penjualan': 'RETUR PENJUALAN',
  'retur-pembelian': 'RETUR PEMBELIAN',
};

type TabKey = 'pembelian' | 'penjualan' | 'koreksi' | 'mutasi';

interface Column {
  readonly text: string;
  readonly end?: boolean;
}

// Tanggal gambar klien: hari/bulan/tahun menurut WIB.
function shortDate(at: string): string {
  const [year = '', month = '', day = ''] = wibDate(new Date(at)).split('-');
  return `${day}/${month}/${year}`;
}

// Kepala tabel selalu tampil, seperti gambar klien; tanpa baris, pesan kosong muncul di bawahnya.
function dataTable(
  name: string,
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
): HTMLElement {
  return el(
    'div',
    { className: 'bo-info__scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': name } },
    el(
      'table',
      { className: 'bo-info__table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ...columns.map((column) =>
            el('th', { className: column.end === true ? 'is-end' : '', text: column.text }),
          ),
        ),
      ),
      el(
        'tbody',
        {},
        ...rows.map((cells) =>
          el(
            'tr',
            {},
            ...cells.map((text, index) =>
              el('td', { className: columns[index]?.end === true ? 'is-end' : '', text }),
            ),
          ),
        ),
      ),
    ),
    rows.length === 0 && el('p', { className: 'bo-info__empty', text: label('infoKosong') }),
  );
}

// Info barang (gambar klien 4 sampai 7): ringkasan stok, lalu empat riwayat Pembelian, Penjualan,
// Koreksi, dan Mutasi yang bisa disaring menurut tanggal dan pihak. Bawaan tanggal 1 pada tiga
// bulan sebelumnya sampai hari ini; Dari dan Sampai membuka rentang lain.
export function openProductInfo(session: BoSession, product: Product): void {
  const store = session.store;
  const isOwner = store.getState().role === 'owner';
  const today = wibDate(session.now());
  const initial = defaultRange(today);

  const dateInput = (name: 'infoDari' | 'infoSampai', value: string): HTMLInputElement => {
    const control = el('input', {
      className: 'bo-pd-input bo-info__date',
      attrs: { type: 'date', 'aria-label': label(name) },
    });
    control.value = value;
    return control;
  };
  const fromInput = dateInput('infoDari', initial.from);
  const toInput = dateInput('infoSampai', initial.to);

  const refresh = el(
    'button',
    {
      className: 'bo-pd-btn bo-pd-btn--icon',
      attrs: {
        type: 'button',
        'aria-label': label('infoTampilkan'),
        title: label('infoTampilkan'),
      },
    },
    icon('refresh-cw'),
  );

  const supplierList = el('datalist', { attrs: { id: nextId('info-pemasok') } });
  const customerList = el('datalist', { attrs: { id: nextId('info-pelanggan') } });
  const partyInput = (list: HTMLElement): HTMLInputElement =>
    el('input', {
      className: 'bo-pd-input bo-info__party-input',
      attrs: {
        type: 'search',
        autocomplete: 'off',
        placeholder: label('boCariPilih'),
        list: list.id,
      },
    });
  const supplierInput = partyInput(supplierList);
  const customerInput = partyInput(customerList);

  const warehouseSelect = el('select', { className: 'bo-pd-input bo-info__warehouse' });
  const warehouseOptions: readonly (readonly [WarehouseFilter, string])[] = [
    ['semua', TEXT.semuaGudang],
    ['display', TEXT.toko],
    ['besar', TEXT.gudangBesar],
  ];
  for (const [value, text] of warehouseOptions) {
    warehouseSelect.append(el('option', { text, attrs: { value } }));
  }
  const unitHint = el('span', { className: 'bo-info__hint' });

  // Label dan kontrol bersaudara (bukan bersarang) agar nama aksesibel kontrol hanya teks label.
  const partyGroup = (
    text: string,
    control: HTMLInputElement | HTMLSelectElement,
    ...extra: Node[]
  ): HTMLElement => {
    const id = nextId('info-filter');
    control.id = id;
    return el(
      'div',
      { className: 'bo-info__party', attrs: { hidden: '' } },
      el('label', { text, attrs: { for: id } }),
      control,
      ...extra,
    );
  };
  const supplierGroup = partyGroup(TEXT.pemasok, supplierInput, supplierList);
  const customerGroup = partyGroup(TEXT.pelanggan, customerInput, customerList);
  const warehouseGroup = partyGroup(TEXT.gudang, warehouseSelect, unitHint);

  const specs: readonly {
    readonly key: TabKey;
    readonly text: string;
    readonly group: HTMLElement | undefined;
  }[] = [
    { key: 'pembelian', text: label('infoTabPembelian'), group: supplierGroup },
    { key: 'penjualan', text: label('infoTabPenjualan'), group: customerGroup },
    { key: 'koreksi', text: label('infoTabKoreksi'), group: undefined },
    { key: 'mutasi', text: TEXT.tabMutasi, group: warehouseGroup },
  ];

  const prefix = nextId('info');
  const panels = new Map<TabKey, HTMLElement>();
  const tabs: HTMLButtonElement[] = [];
  const tabList = el('div', {
    className: 'bo-info__tabs',
    attrs: { role: 'tablist', 'aria-label': label('infoRiwayat') },
  });
  const panelBox = el('div', { className: 'bo-info__panels' });

  let history: ProductHistory = { pembelian: [], penjualan: [], koreksi: [] };
  let range: HistoryRange = initial;

  const paintPembelian = (): void => {
    const columns: Column[] = [
      { text: 'TGL PEMBELIAN' },
      { text: 'NO NOTA' },
      { text: 'QTY' },
      { text: 'SATUAN' },
      ...(isOwner ? [{ text: 'HARGA', end: true }] : []),
      { text: 'PEMASOK' },
    ];
    const rows = filterByParty(history.pembelian, supplierInput.value).map((row) => [
      shortDate(row.at),
      row.number,
      formatDecimal(row.quantity),
      row.unit,
      ...(isOwner ? [formatRupiah(row.unitPrice)] : []),
      row.party,
    ]);
    panels.get('pembelian')?.replaceChildren(dataTable(label('infoTabPembelian'), columns, rows));
  };

  const paintPenjualan = (): void => {
    const columns: Column[] = [
      { text: 'TGL PENJUALAN' },
      { text: 'NO NOTA' },
      { text: 'QTY' },
      { text: 'SATUAN' },
      { text: 'HARGA', end: true },
      { text: 'PELANGGAN' },
    ];
    const rows = filterByParty(history.penjualan, customerInput.value).map((row) => [
      shortDate(row.at),
      row.number,
      formatDecimal(row.quantity),
      row.unit,
      formatRupiah(row.unitPrice),
      row.party,
    ]);
    panels.get('penjualan')?.replaceChildren(dataTable(label('infoTabPenjualan'), columns, rows));
  };

  const paintKoreksi = (): void => {
    const columns: Column[] = [
      { text: 'TGL KOREKSI' },
      { text: 'NO KOREKSI' },
      { text: 'QTY AWAL' },
      { text: 'AKSI' },
      { text: 'QTY' },
      { text: 'QTY AKHIR' },
    ];
    const rows = history.koreksi.map((row) => [
      shortDate(row.at),
      row.number,
      `${formatDecimal(row.qtyBefore)} ${row.unit}`,
      row.action === 'tambah' ? TEXT.tambah : TEXT.kurang,
      `${formatDecimal(row.qty)} ${row.unit}`,
      `${formatDecimal(row.qtyAfter)} ${row.unit}`,
    ]);
    panels.get('koreksi')?.replaceChildren(dataTable(label('infoTabKoreksi'), columns, rows));
  };

  const paintMutasi = (): void => {
    const columns: Column[] = [
      { text: 'TANGGAL' },
      { text: 'NOMOR' },
      { text: 'TRANSAKSI' },
      { text: 'NAMA' },
      { text: 'MASUK' },
      { text: 'KELUAR' },
      { text: 'SALDO' },
    ];
    const warehouse = warehouseSelect.value as WarehouseFilter;
    const result = buildMutationHistory({
      product,
      sources: movementSourcesFor(session),
      range,
      warehouse,
    });
    unitHint.textContent = TEXT.satuanDasar.replace('{satuan}', result.unit);
    const rows = result.rows.map((row) => [
      shortDate(row.at),
      row.number,
      KIND_TEXT[row.kind],
      row.name,
      row.inQty > 0 ? formatDecimal(row.inQty) : '',
      row.outQty > 0 ? formatDecimal(row.outQty) : '',
      formatDecimal(row.balance),
    ]);
    panels.get('mutasi')?.replaceChildren(dataTable(TEXT.tabMutasi, columns, rows));
  };

  const paint = (): void => {
    range = normalizeRange({
      from: fromInput.value === '' ? initial.from : fromInput.value,
      to: toInput.value === '' ? initial.to : toInput.value,
    });
    // Rentang yang terbalik ditukar, dan isian ikut diperbarui agar jelas apa yang ditampilkan.
    fromInput.value = range.from;
    toInput.value = range.to;
    history = buildProductHistory({
      product,
      state: store.getState(),
      corrections: ledgerFor(store).docs(),
      range,
    });
    supplierList.replaceChildren(
      ...[...new Set(history.pembelian.map((row) => row.party))].map((party) =>
        el('option', { attrs: { value: party } }),
      ),
    );
    customerList.replaceChildren(
      ...[...new Set(history.penjualan.map((row) => row.party))].map((party) =>
        el('option', { attrs: { value: party } }),
      ),
    );
    paintPembelian();
    paintPenjualan();
    paintKoreksi();
    paintMutasi();
  };

  const select = (index: number, focus: boolean): void => {
    specs.forEach((spec, position) => {
      const active = position === index;
      const tab = tabs[position];
      tab?.setAttribute('aria-selected', active ? 'true' : 'false');
      if (tab !== undefined) {
        tab.tabIndex = active ? 0 : -1;
      }
      panels.get(spec.key)?.toggleAttribute('hidden', !active);
      spec.group?.toggleAttribute('hidden', !active);
    });
    if (focus) {
      tabs[index]?.focus();
    }
  };

  specs.forEach((spec, index) => {
    const tab = el('button', {
      className: 'bo-info__tab',
      text: spec.text,
      attrs: {
        id: `${prefix}-tab-${spec.key}`,
        role: 'tab',
        type: 'button',
        'aria-controls': `${prefix}-panel-${spec.key}`,
      },
    });
    tab.addEventListener('click', () => {
      select(index, false);
    });
    tab.addEventListener('keydown', (event) => {
      const last = specs.length - 1;
      const moves: Readonly<Record<string, number>> = {
        ArrowRight: index === last ? 0 : index + 1,
        ArrowLeft: index === 0 ? last : index - 1,
        Home: 0,
        End: last,
      };
      const target = moves[event.key];
      if (target !== undefined) {
        event.preventDefault();
        select(target, true);
      }
    });
    tabs.push(tab);
    tabList.append(tab);
    const panel = el('div', {
      className: 'bo-info__panel',
      attrs: {
        id: `${prefix}-panel-${spec.key}`,
        role: 'tabpanel',
        'aria-labelledby': `${prefix}-tab-${spec.key}`,
      },
    });
    panels.set(spec.key, panel);
    panelBox.append(panel);
  });

  refresh.addEventListener('click', paint);
  for (const input of [fromInput, toInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        paint();
      }
    });
  }
  supplierInput.addEventListener('input', paintPembelian);
  customerInput.addEventListener('input', paintPenjualan);
  warehouseSelect.addEventListener('change', paintMutasi);

  const initialStock = product.initialStock;
  const summary = el(
    'div',
    { className: 'bo-info__summary' },
    el('span', {
      text: label('infoStokRingkas', {
        toko: formatDecimal(product.stock.display),
        gudang: formatDecimal(product.stock.besar),
        satuan: product.baseUnit,
      }),
    }),
    el('span', { text: label('infoRak', { rak: product.rak ?? '-' }) }),
    el('span', {
      text:
        initialStock === undefined
          ? label('infoTanpaSaldoAwal')
          : isOwner
            ? label('infoSaldoAwal', {
                tanggal: initialStock.date ?? '-',
                jumlah: formatDecimal(initialStock.quantity ?? 0),
                satuan: initialStock.unit ?? product.baseUnit,
                nilai: formatRupiah(initialStock.unitPrice ?? product.hpp),
              })
            : label('infoSaldoAwalTanpaNilai', {
                tanggal: initialStock.date ?? '-',
                jumlah: formatDecimal(initialStock.quantity ?? 0),
                satuan: initialStock.unit ?? product.baseUnit,
              }),
    }),
  );

  const filter = el(
    'div',
    { className: 'bo-info__filter' },
    fromInput,
    el('span', { className: 'bo-info__sep', text: TEXT.sampaiDengan }),
    toInput,
    refresh,
    supplierGroup,
    customerGroup,
    warehouseGroup,
  );

  paint();
  select(0, false);
  openModal({
    title: TEXT.judul,
    body: el(
      'div',
      { className: 'bo-info' },
      summary,
      tabList,
      el('h3', { className: 'bo-info__product', text: `${product.name} (${product.code})` }),
      filter,
      panelBox,
    ),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
