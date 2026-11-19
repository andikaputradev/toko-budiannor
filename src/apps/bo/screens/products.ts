import '../../../styles/bo-products.css';
import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { round3 } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto, productPhotoUrl } from '../../../shared/ui/product-photo';
import { showToast } from '../../../shared/ui/toast';
import { createVirtualGrid } from '../../../shared/ui/virtual-grid';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import { getSampleExcelProducts } from '../domain/import-excel';
import {
  parseOpening,
  perUnit,
  seedOpening,
  stockAfter,
  type OpeningDraft,
  type OpeningEntry,
  type OpeningIssue,
} from '../domain/opening-balance';
import { parsePrice, rowsOf as priceRowsOf } from '../domain/pricing';
import { openingBalances } from '../domain/session-drafts';
import { BRAND_OPTIONS, CATEGORY_OPTIONS } from '../domain/product-options';
import {
  CODE_MAX,
  draftOf,
  nextProductCode,
  parseMin,
  splitMin,
  type ProductDraft,
  type ProductIssue,
} from '../domain/product-form';
import { UNIT_CODES, rowsOf, type UnitRowDraft } from '../domain/product-units';
import { findProducts } from '../search';
import { requestCloseTab, screenActive } from '../screen-active';
import type { ScreenHandle } from './login';
import { createUnitPicker } from './product-unit-picker';

// Teks tombol pada kamus berhuruf kapital; tampilkan sebagai kalimat biasa.
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

const TEXT = {
  batal: 'Batal',
  ubah: 'Ubah',
  harga: 'Harga',
  saldoAwal: 'Saldo Stok Awal',
  tambah: 'Tambah',
  impor: 'Import',
  kode: 'Kode',
  tanggal: 'Tanggal',
  kuantitas: 'Kuantitas',
  satuan: 'Satuan',
  gudang: 'Gudang',
  biayaSatuan: 'Biaya Satuan',
  pemasok: 'Pemasok',
  tglBeli: 'Tgl Beli',
  hargaBeliAkhir: 'Harga Beli Akhir',
  hppAvg: 'Hpp Avg',
  minStokAll: 'Min Stok (All)',
  saldoKosong: 'Belum ada saldo awal.',
  pilihBarang: 'Pilih barang dari daftar dulu.',
  hanyaOwner: 'Hanya Owner yang dapat membuka halaman ini.',
  klikHarga: 'Klik baris harga untuk mengisi atau mengubah harga jual (Owner).',
  tambahDulu: 'Klik Tambah, isi data barang, lalu klik baris harga.',
  ubahDulu: 'Pilih barang lalu klik Ubah untuk mengubah datanya.',
  simpanDulu: 'Barang baru belum tersimpan. Simpan barangnya dulu.',
  hargaTersimpan: 'Harga jual {kode} tersimpan.',
  saldoTersimpan: 'Saldo awal {kode} ditambahkan.',
  hargaDiBawahHpp: 'Harga di bawah HPP. Tetap simpan?',
  tetapSimpan: 'Tetap Simpan',
  imporSaldoJudul: 'Import Saldo Awal',
  imporSaldoIsi: 'Pilih opsi impor saldo awal barang via format Excel (simulasi):',
  imporSaldoContoh: 'Muat Contoh Excel',
  imporSaldoOk: '2 baris saldo awal contoh ditambahkan.',
  galat: {
    gudang: 'Pilih gudang.',
    tanggal: 'Isi tanggal saldo awal.',
    kuantitas: 'Isi kuantitas lebih dari 0.',
    satuan: 'Pilih satuan.',
    biaya: 'Isi biaya satuan lebih dari 0.',
  } satisfies Record<OpeningIssue, string>,
} as const;

function issueText(issue: ProductIssue): string {
  if (issue.messageId !== undefined) {
    return message(issue.messageId);
  }
  return 'labelKey' in issue ? label(issue.labelKey) : label('produkErrKodePendek');
}

function setSelect(select: HTMLSelectElement, value: string, fallback: string): void {
  const wanted = value === '' ? fallback : value;
  if (wanted !== '' && ![...select.options].some((option) => option.value === wanted)) {
    select.append(el('option', { text: wanted, attrs: { value: wanted } }));
  }
  select.value = wanted;
}

interface TypedPrice {
  ecer: string;
  grosir: string;
}

export function renderProducts(session: BoSession): ScreenHandle {
  const store = session.store;
  // Harga Beli Akhir dan HPP hanya untuk Owner: bagian ini tidak dirender sama sekali untuk peran lain.
  const isOwner = store.getState().role === 'owner';
  let query = '';
  let selectedId: string | undefined;
  let isNew = false;
  let isEditing = false;
  let photo = { name: '', bytes: 0 };
  let previewUrl: string | undefined;
  const typed: TypedPrice[] = [
    { ecer: '', grosir: '' },
    { ecer: '', grosir: '' },
    { ecer: '', grosir: '' },
  ];

  const products = (): readonly Product[] => store.getState().data.products;
  const rows = (): readonly Product[] => findProducts(products(), query, products().length);
  const productById = (id: string | undefined): Product | undefined =>
    products().find((item) => item.id === id);

  // --- Tombol aksi ---
  const actionButton = (
    iconName: IconName,
    text: string,
    title: string,
    className = '',
    ariaLabel?: string,
  ): HTMLButtonElement =>
    el(
      'button',
      {
        className: `bo-pd-btn ${className}`.trim(),
        attrs: {
          type: 'button',
          title,
          ...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {}),
        },
      },
      icon(iconName),
      el('span', { text }),
    );
  // Tambah berfungsi ganda: saat mengisi barang baru atau mengubah barang, tombolnya menjadi Batal.
  const btnTambah = actionButton(
    'plus',
    sentenceCase(label('btnAksiTambah')),
    'Tambah (Alt+T)',
    'bo-pd-btn--primary',
    label('tambahBarang'),
  );
  const btnUbah = actionButton('pencil', TEXT.ubah, 'Ubah (Alt+U)', '', TEXT.ubah);
  const btnSimpan = actionButton(
    'save',
    sentenceCase(label('simpan')),
    'Simpan (Alt+S)',
    '',
    label('simpanBarang'),
  );
  const btnNonaktif = actionButton(
    'trash-2',
    sentenceCase(label('nonaktifkan')),
    'Nonaktifkan (Alt+H)',
    'bo-pd-btn--danger',
    label('nonaktifkanBarang'),
  );
  btnNonaktif.hidden = !session.allowed('BO-03', 'Nonaktifkan Barang');
  const btnKeluar = actionButton('log-out', sentenceCase(label('btnAksiKeluar')), 'Keluar (Alt+K)');
  const btnInfo = actionButton('info', sentenceCase(label('btnAksiInfo')), 'Info SKU');
  const btnCetak = actionButton('printer', sentenceCase(label('btnAksiCetak')), 'Cetak (Alt+C)');

  const searchInput = el('input', {
    className: 'bo-pd-search',
    attrs: {
      type: 'search',
      placeholder: label('placeholderCariBarang'),
      autocomplete: 'off',
      'aria-label': label('cari'),
    },
  });
  const btnRefresh = el(
    'button',
    {
      className: 'bo-pd-btn bo-pd-btn--icon',
      attrs: {
        type: 'button',
        'aria-label': label('boSegarkanDaftar'),
        title: label('boSegarkanDaftar'),
      },
    },
    icon('refresh-cw'),
  );
  const btnImpor = el(
    'button',
    {
      className: 'bo-pd-btn bo-pd-btn--icon',
      attrs: { type: 'button', 'aria-label': label('boImporExcel'), title: label('boImporExcel') },
    },
    icon('download'),
  );
  const formError = el('p', { className: 'bo-pd-error', attrs: { role: 'alert' } });

  // --- Isian formulir ---
  const input = (
    labelText: string,
    ariaLabel: string,
    options: { readonly inputMode?: string; readonly maxLength?: number } = {},
  ): { readonly control: HTMLInputElement; readonly field: HTMLElement } => {
    const id = nextId('bo-pd');
    const control = el('input', {
      className: 'bo-pd-input',
      attrs: {
        id,
        type: 'text',
        autocomplete: 'off',
        'aria-label': ariaLabel,
        ...(options.inputMode === undefined ? {} : { inputmode: options.inputMode }),
        ...(options.maxLength === undefined ? {} : { maxlength: String(options.maxLength) }),
      },
    });
    return {
      control,
      field: el(
        'div',
        { className: 'bo-pd-field' },
        el('label', { attrs: { for: id }, text: labelText }),
        control,
      ),
    };
  };
  const select = (
    labelText: string,
    ariaLabel: string,
    options: readonly string[],
  ): { readonly control: HTMLSelectElement; readonly field: HTMLElement } => {
    const id = nextId('bo-pd');
    const control = el(
      'select',
      { className: 'bo-pd-input', attrs: { id, 'aria-label': ariaLabel } },
      ...options.map((value) => el('option', { text: value, attrs: { value } })),
    );
    return {
      control,
      field: el(
        'div',
        { className: 'bo-pd-field' },
        el('label', { attrs: { for: id }, text: labelText }),
        control,
      ),
    };
  };
  const percentInput = (
    labelText: string,
    ariaLabel: string,
  ): { readonly control: HTMLInputElement; readonly field: HTMLElement } => {
    const base = input(labelText, ariaLabel, { inputMode: 'decimal' });
    const heading = base.field.firstElementChild;
    base.field.replaceChildren(
      ...(heading === null ? [] : [heading]),
      el(
        'div',
        { className: 'bo-pd-suffix' },
        base.control,
        el('span', {
          className: 'bo-pd-suffix__unit',
          text: '%',
          attrs: { 'aria-hidden': 'true' },
        }),
      ),
    );
    return base;
  };

  const nama = input('Nama', label('namaBarang'));
  const kode = input('Kode', label('kodeBarang'), { maxLength: CODE_MAX });
  // Kode dibuat otomatis saat Tambah dan tidak diketik.
  kode.control.readOnly = true;
  const barcode = input('Barcode', label('barcode'), { inputMode: 'numeric' });
  const kategori = select('Kategori', label('kategori'), CATEGORY_OPTIONS);
  const merk = select('Merk', label('merek'), BRAND_OPTIONS);
  const rak = input(label('labelNoRak'), label('labelNoRak'));
  const berat = input(label('labelBeratBarang'), label('labelBeratBarang'), {
    inputMode: 'decimal',
  });
  const catatan = input(label('labelCatatanBarang'), label('labelCatatanBarang'));
  const supplier = input(label('labelSuplier'), label('menuPemasok'));
  const tglBeli = input(label('labelTglBeliAkhir'), label('labelTglBeliAkhir'));
  const hargaBeli = input(label('labelHargaBeliAkhir'), label('labelHargaBeliAkhir'), {
    inputMode: 'numeric',
  });
  const hppAvg = input(label('labelHppAvg'), label('labelHppAvg'), { inputMode: 'numeric' });
  const minAll = input(TEXT.minStokAll, label('labelMinStokAll'), {
    inputMode: 'decimal',
  });
  const minToko = input(label('labelMinStokTokoSingkat'), label('stokMinDisplay'), {
    inputMode: 'decimal',
  });
  const komisi = percentInput(label('labelKomisiSales'), label('labelKomisiSales'));
  const promo = percentInput(label('labelPromo'), label('labelPromo'));

  const knownCodes = (): readonly string[] => {
    const seen = new Set(UNIT_CODES.map((code) => code.toLowerCase()));
    const extra: string[] = [];
    for (const item of products()) {
      for (const unit of item.units) {
        if (!seen.has(unit.code.toLowerCase())) {
          seen.add(unit.code.toLowerCase());
          extra.push(unit.code);
        }
      }
    }
    return [...UNIT_CODES, ...extra];
  };

  const priceBody = el('tbody');
  const unitPicker = createUnitPicker({
    codes: knownCodes(),
    onChange: () => {
      renderMatrix();
    },
  });

  // --- Foto ---
  const photoInputId = nextId('foto-bo');
  const fileInput = el('input', {
    className: 'bo-pd-photo__file',
    attrs: { id: photoInputId, type: 'file', accept: 'image/*' },
  });
  const photoSlot = el('div', { className: 'bo-pd-photo__slot' });
  const zoomButton = el(
    'button',
    {
      className: 'bo-pd-photo__zoom',
      attrs: {
        type: 'button',
        'aria-label': label('boPerbesarFoto'),
        title: label('boPerbesarFoto'),
      },
    },
    icon('zoom-in'),
  );
  const showPhoto = (product: Product | undefined, preview?: string): void => {
    previewUrl = preview;
    if (preview !== undefined) {
      photoSlot.replaceChildren(
        el('img', { className: 'bo-product-img', attrs: { alt: '', src: preview } }),
      );
    } else if (product !== undefined) {
      photoSlot.replaceChildren(createProductPhoto(product, 'lg'));
    } else {
      photoSlot.replaceChildren(
        el('span', { className: 'mob-photo mob-photo--lg mob-photo--empty' }, icon('package')),
      );
    }
    zoomButton.disabled =
      preview === undefined && (product === undefined || productPhotoUrl(product) === undefined);
  };
  const photoBox = el(
    'div',
    { className: 'bo-pd-photo' },
    el('div', { className: 'bo-pd-photo__frame' }, photoSlot, zoomButton),
    el('label', {
      className: 'bo-pd-photo__pick',
      attrs: { for: photoInputId },
      text: 'Ganti Foto',
    }),
    fileInput,
  );

  // --- Daftar barang ---
  const count = el('p', { className: 'bo-pd-count', attrs: { 'aria-live': 'polite' } });
  const dateText = (iso: string | undefined): string =>
    iso === undefined || iso === '' ? '-' : iso.slice(0, 10).split('-').reverse().join('/');
  const grid = createVirtualGrid<Product>({
    label: label('daftarBarang'),
    columns: [
      {
        header: 'Nama Barang',
        width: 'minmax(170px, 2.2fr)',
        cell: (p) => (p.active === false ? `${p.name} (Nonaktif)` : p.name),
      },
      { header: TEXT.kode, width: '76px', cell: (p) => p.code },
      { header: 'Satuan', width: '72px', cell: (p) => p.baseUnit },
      {
        header: label('kolomStokTokoSingkat'),
        width: '92px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.display, 3, 0),
      },
      {
        header: label('kolomStokGdgSingkat'),
        width: '116px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.besar, 3, 0),
      },
      {
        header: label('kolomQtyPoSingkat'),
        width: '70px',
        align: 'end',
        cell: (p) => formatDecimal(p.incoming ?? 0),
      },
      { header: TEXT.pemasok, width: 'minmax(120px, 1.4fr)', cell: (p) => p.supplierName ?? '-' },
      { header: TEXT.tglBeli, width: '100px', cell: (p) => dateText(p.lastPurchaseDate) },
      // Harga Beli Akhir dan HPP rata-rata hanya terlihat oleh Owner.
      ...(isOwner
        ? [
            {
              header: TEXT.hargaBeliAkhir,
              width: '146px',
              align: 'end' as const,
              cell: (p: Product) => formatDecimal(p.lastPurchasePrice ?? 0, 0),
            },
            {
              header: TEXT.hppAvg,
              width: '90px',
              align: 'end' as const,
              cell: (p: Product) => formatDecimal(p.hppAvg ?? p.hpp, 0),
            },
          ]
        : []),
    ],
    rows: rows(),
    onSelect: (item) => {
      selectedId = item.id;
      isNew = false;
      fillForm(item);
      setFormEnabled(false);
    },
  });

  // --- Panel Harga: mengikuti baris satuan. Hanya Owner yang dapat mengklik barisnya untuk mengisi
  // atau mengubah harga jual (dialog Isi Harga Jual Barang, gambar klien 38). ---
  const priceTable = el(
    'table',
    { attrs: { 'aria-label': label('boMatriksHarga') } },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: TEXT.harga }),
        el('th', { text: label('kolomHargaRetail') }),
        el('th', { text: label('kolomHargaGrosir') }),
      ),
    ),
    priceBody,
  );

  const factorOf = (row: UnitRowDraft, index: number): number =>
    index === 0 ? 1 : Number(row.factor.replace(',', '.')) || 1;

  function renderMatrix(): void {
    const used = unitPicker.getRows().filter((row) => row.code !== '');
    if (used.length === 0) {
      priceBody.replaceChildren(
        el('tr', {}, el('td', { attrs: { colspan: '3' }, text: label('boPilihBarang') })),
      );
      return;
    }
    const product = productById(selectedId);
    priceBody.replaceChildren(
      ...used.slice(0, 3).map((row, index) => {
        const name = index === 0 ? row.code : `${row.code} (${row.factor || '?'})`;
        const prices = isNew ? undefined : product?.prices[row.code];
        const typedPrice = typed[index];
        const value = (kind: 'ecer' | 'grosir'): string => {
          if (isNew) {
            const digits = kind === 'ecer' ? typedPrice?.ecer : typedPrice?.grosir;
            return digits === undefined || digits === ''
              ? '-'
              : formatDecimal(parsePrice(digits), 0);
          }
          const number = kind === 'ecer' ? prices?.eceran : prices?.grosir;
          return number === undefined ? '-' : formatDecimal(number, 0);
        };
        const tr = el(
          'tr',
          isOwner
            ? {
                className: 'bo-pd-prices__row',
                attrs: { tabindex: '0', title: TEXT.klikHarga },
              }
            : {},
          el('td', { text: name }),
          el('td', { text: value('ecer') }),
          el('td', { text: value('grosir') }),
        );
        if (isOwner) {
          tr.addEventListener('click', openPrices);
          tr.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              openPrices();
            }
          });
        }
        return tr;
      }),
    );
  }

  function openPrices(): void {
    if (!isOwner) {
      showToast({ kind: 'error', text: TEXT.hanyaOwner });
      return;
    }
    const product = productById(selectedId);
    if (isNew && !isEditing) {
      showToast({ kind: 'info', text: TEXT.tambahDulu });
      return;
    }
    if (!isNew && product === undefined) {
      showToast({ kind: 'info', text: TEXT.pilihBarang });
      return;
    }
    const used = unitPicker
      .getRows()
      .filter((row) => row.code !== '')
      .slice(0, 3);
    if (used.length === 0) {
      showToast({ kind: 'info', text: label('boPilihBarang') });
      return;
    }
    const units = used.map((row, index) => ({ code: row.code, factor: factorOf(row, index) }));
    const values = used.map((row, index) =>
      isNew
        ? { ecer: typed[index]?.ecer ?? '', grosir: typed[index]?.grosir ?? '' }
        : {
            ecer: String(product?.prices[row.code]?.eceran ?? ''),
            grosir: String(product?.prices[row.code]?.grosir ?? ''),
          },
    );
    void import('./product-dialogs').then(({ openPriceDialog }) => {
      openPriceDialog({
        code: isNew ? kode.control.value || '-' : (product?.code ?? '-'),
        name: isNew ? nama.control.value : (product?.name ?? ''),
        units,
        values,
        lastBuy: units.map((unit) => perUnit(product?.lastPurchasePrice, unit.factor)),
        hpp: units.map((unit) => perUnit(product?.hppAvg ?? product?.hpp, unit.factor)),
        save: (next) => savePrices(next, product),
      });
    });
  }

  // Barang baru: harga disimpan pada isian dan ikut tersimpan bersama barangnya. Barang yang sudah
  // ada: harga langsung tersimpan; harga di bawah HPP meminta konfirmasi dulu.
  async function savePrices(
    next: readonly { readonly ecer: string; readonly grosir: string }[],
    product: Product | undefined,
  ): Promise<string | undefined> {
    if (isNew || product === undefined) {
      next.forEach((value, index) => {
        const slot = typed[index];
        if (slot !== undefined) {
          slot.ecer = digits(value.ecer);
          slot.grosir = digits(value.grosir);
        }
      });
      renderMatrix();
      return undefined;
    }
    const rows = priceRowsOf(product).map((row, index) => ({
      ...row,
      eceran: next[index] === undefined ? row.eceran : String(parsePrice(next[index].ecer)),
      grosir: next[index] === undefined ? row.grosir : String(parsePrice(next[index].grosir)),
    }));
    const attempt = (confirmed: boolean): string | undefined => {
      const result = session.savePricing(product.id, rows, confirmed);
      if (result.ok) {
        showToast({ kind: 'success', text: TEXT.hargaTersimpan.replace('{kode}', product.code) });
        refreshList();
        fillForm(productById(product.id));
        return undefined;
      }
      if (result.kind === 'denied') {
        return message(result.messageId);
      }
      if (result.kind === 'issue') {
        return 'messageId' in result.issue
          ? message(result.issue.messageId)
          : label(result.issue.labelKey);
      }
      // Harga di bawah HPP: minta konfirmasi, lalu simpan ulang tanpa menutup dialog harga.
      openModal({
        title: label('simpan'),
        body: TEXT.hargaDiBawahHpp,
        actions: [
          { text: TEXT.batal, variant: 'secondary' },
          {
            text: TEXT.tetapSimpan,
            variant: 'primary',
            onClick: () => {
              attempt(true);
            },
          },
        ],
      });
      return TEXT.hargaDiBawahHpp;
    };
    return Promise.resolve(attempt(false));
  }

  // --- Saldo Stok Awal (gambar klien 37 dan 39): daftar catatan, tambah dan import hanya Owner ---
  const openingBody = el('tbody');
  const openingHead = el(
    'tr',
    {},
    el('th', { text: TEXT.tanggal }),
    el('th', { text: TEXT.kuantitas }),
    el('th', { text: TEXT.satuan }),
    el('th', { text: TEXT.gudang }),
    isOwner ? el('th', { text: TEXT.biayaSatuan }) : false,
  );
  const openingAdd = createButton({
    text: TEXT.tambah,
    variant: 'primary',
    icon: 'plus',
    onClick: () => {
      openOpeningDialogFor(false);
    },
  });
  const openingImport = createButton({
    text: TEXT.impor,
    variant: 'primary',
    icon: 'plus',
    onClick: () => {
      openOpeningDialogFor(true);
    },
  });
  openingAdd.classList.add('bo-pd-opening__btn');
  openingImport.classList.add('bo-pd-opening__btn');

  const warehouseText = (warehouse: OpeningEntry['warehouse']): string =>
    label(warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay');

  const openingFor = (product: Product): OpeningEntry[] => {
    let list = openingBalances.get(product.id);
    if (list === undefined) {
      list = seedOpening(product, store.getState().data.referenceDate.slice(0, 10));
      openingBalances.set(product.id, list);
    }
    return list;
  };

  function renderOpening(): void {
    const product = productById(selectedId);
    const list = product === undefined || isNew ? [] : openingFor(product);
    openingAdd.disabled = product === undefined || isNew;
    openingImport.disabled = product === undefined || isNew;
    if (list.length === 0) {
      openingBody.replaceChildren(
        el('tr', {}, el('td', { text: TEXT.saldoKosong, attrs: { colspan: isOwner ? '5' : '4' } })),
      );
      return;
    }
    openingBody.replaceChildren(
      ...list.map((entry) =>
        el(
          'tr',
          {},
          el('td', { text: dateText(entry.date) }),
          el('td', { text: formatDecimal(entry.quantity, 3, 0) }),
          el('td', { text: entry.unit }),
          el('td', { text: warehouseText(entry.warehouse) }),
          isOwner ? el('td', { text: formatRupiah(entry.unitCost) }) : false,
        ),
      ),
    );
  }

  // Menambah saldo awal: stok gudang bertambah, catatan awal dibangkitkan lebih dulu dari stok lama.
  function applyOpening(product: Product, entry: OpeningEntry): void {
    openingFor(product).push(entry);
    store.setStock(product.id, stockAfter(product, entry));
    store.logActivity({
      at: session.now().toISOString(),
      userId: session.state().user?.id ?? store.getState().userId,
      device: BO_DEVICE,
      ip: BO_IP,
      kind: 'koreksi',
      detail: `Saldo awal ${product.code}: ${formatDecimal(entry.quantity, 3, 0)} ${entry.unit} ${warehouseText(entry.warehouse)}`,
    });
  }

  function openOpeningDialogFor(sample: boolean): void {
    if (!isOwner) {
      showToast({ kind: 'error', text: TEXT.hanyaOwner });
      return;
    }
    const product = productById(selectedId);
    if (product === undefined || isNew) {
      showToast({ kind: 'info', text: isNew ? TEXT.simpanDulu : TEXT.pilihBarang });
      return;
    }
    const done = (): void => {
      showToast({
        kind: 'success',
        text: TEXT.saldoTersimpan.replace('{kode}', product.code),
      });
      refreshList();
      fillForm(productById(product.id));
    };
    if (sample) {
      openModal({
        title: TEXT.imporSaldoJudul,
        body: TEXT.imporSaldoIsi,
        actions: [
          { text: TEXT.batal, variant: 'secondary' },
          {
            text: TEXT.imporSaldoContoh,
            variant: 'primary',
            onClick: () => {
              const day = store.getState().data.referenceDate.slice(0, 10);
              const unit = product.units[0]?.code ?? product.baseUnit;
              const cost = Math.round(product.hppAvg ?? product.hpp);
              openingFor(product);
              for (const [warehouse, quantity] of [
                ['display', 10],
                ['besar', 20],
              ] as const) {
                applyOpening(product, { date: day, quantity, unit, warehouse, unitCost: cost });
              }
              showToast({ kind: 'success', text: TEXT.imporSaldoOk });
              refreshList();
              fillForm(productById(product.id));
            },
          },
        ],
      });
      return;
    }
    void import('./product-dialogs').then(({ openOpeningDialog }) => {
      const unitCodes = product.units.map((unit) => unit.code);
      openOpeningDialog({
        code: product.code,
        name: product.name,
        units: unitCodes,
        warehouses: [
          { value: 'display', text: warehouseText('display') },
          { value: 'besar', text: warehouseText('besar') },
        ],
        defaultUnit: product.defaultUnit ?? unitCodes[0] ?? product.baseUnit,
        today: session.now().toISOString().slice(0, 10),
        save: (draft: OpeningDraft) => {
          const parsed = parseOpening(product, draft);
          if (!parsed.ok) {
            return TEXT.galat[parsed.issue];
          }
          openingFor(product);
          applyOpening(product, parsed.entry);
          done();
          return undefined;
        },
      });
    });
  }

  const fields: readonly (HTMLInputElement | HTMLSelectElement)[] = [
    nama.control,
    kode.control,
    barcode.control,
    kategori.control,
    merk.control,
    rak.control,
    berat.control,
    catatan.control,
    supplier.control,
    tglBeli.control,
    hargaBeli.control,
    hppAvg.control,
    minAll.control,
    minToko.control,
    komisi.control,
    promo.control,
  ];

  let setFormEnabled = (enabled: boolean): void => {
    isEditing = enabled;
    for (const field of fields) {
      field.disabled = !enabled;
    }
    unitPicker.setEnabled(enabled);
    btnSimpan.classList.toggle('bo-pd-btn--active', enabled);
    renderMatrix();
  };

  const fillForm = (product: Product | undefined): void => {
    formError.textContent = '';
    unitPicker.markIssue(undefined);
    for (const slot of typed) {
      slot.ecer = '';
      slot.grosir = '';
    }
    if (product === undefined) {
      for (const field of fields) {
        field.value = '';
      }
      setSelect(kategori.control, '', CATEGORY_OPTIONS[0] ?? '');
      setSelect(merk.control, '', BRAND_OPTIONS[0] ?? '');
      unitPicker.setRows([]);
      showPhoto(undefined);
      photo = { name: '', bytes: 0 };
      renderMatrix();
      renderOpening();
      syncToolbar();
      return;
    }
    const draft = draftOf(product);
    nama.control.value = draft.name;
    kode.control.value = draft.code;
    barcode.control.value = draft.barcode;
    setSelect(kategori.control, draft.category, CATEGORY_OPTIONS[0] ?? '');
    setSelect(merk.control, draft.brand, BRAND_OPTIONS[0] ?? '');
    unitPicker.setRows(rowsOf(product));
    minAll.control.value = draft.minStockAll ?? '';
    minToko.control.value = String(splitMin(product).display).replace('.', ',');
    rak.control.value = draft.rak ?? '';
    berat.control.value = draft.berat ?? '';
    komisi.control.value = draft.komisiSalesPersen ?? '';
    promo.control.value = draft.promoPersen ?? '';
    catatan.control.value = draft.catatan ?? '';
    supplier.control.value = draft.supplierName ?? '';
    tglBeli.control.value = draft.tglBeliAkhir ?? '';
    hargaBeli.control.value = draft.hargaBeliAkhir ?? '';
    hppAvg.control.value = draft.hppAvg ?? '';
    showPhoto(product);
    photo = { name: '', bytes: 0 };
    renderMatrix();
    renderOpening();
    syncToolbar();
  };

  const refreshList = (): void => {
    const list = rows();
    count.textContent = label('jumlahBarang', { jumlah: formatDecimal(list.length) });
    grid.setRows(list);
  };

  const digits = (text: string | undefined): string => (text ?? '').replace(/\D/g, '');

  const draftFromForm = (): ProductDraft | undefined => {
    const unitRows: readonly UnitRowDraft[] = unitPicker.getRows();
    const all = parseMin(minAll.control.value);
    const toko = parseMin(minToko.control.value);
    // ALL kosong berarti total minimum sama dengan minimum Toko (tanpa minimum Gudang).
    const allFilled = minAll.control.value.trim() !== '';
    if (allFilled && all !== undefined && toko !== undefined && toko > all) {
      formError.textContent = label('produkErrMinToko');
      minToko.control.setAttribute('aria-invalid', 'true');
      return undefined;
    }
    minToko.control.removeAttribute('aria-invalid');
    const baseCode = unitRows[0]?.code ?? '';
    const besar =
      all !== undefined && toko !== undefined ? (allFilled ? round3(all - toko) : 0) : undefined;
    return {
      code: kode.control.value,
      barcode: barcode.control.value,
      name: nama.control.value,
      brand: merk.control.value,
      category: kategori.control.value,
      baseUnit: baseCode,
      allowDecimal: productById(selectedId)?.allowDecimal ?? false,
      defaultUnit: baseCode,
      unitRows,
      minDisplay: minToko.control.value,
      minBesar: besar === undefined ? minAll.control.value : String(besar).replace('.', ','),
      photoName: photo.name,
      photoBytes: photo.bytes,
      rak: rak.control.value,
      berat: berat.control.value.replace(',', '.'),
      komisiSalesPersen: komisi.control.value,
      promoPersen: promo.control.value,
      catatan: catatan.control.value,
      supplierName: supplier.control.value,
      tglBeliAkhir: tglBeli.control.value,
      hargaBeliAkhir: digits(hargaBeli.control.value),
      hppAvg: digits(hppAvg.control.value),
      hargaEcer1: digits(typed[0]?.ecer),
      hargaGrosir1: digits(typed[0]?.grosir),
      hargaEcer2: digits(typed[1]?.ecer),
      hargaGrosir2: digits(typed[1]?.grosir),
      hargaEcer3: digits(typed[2]?.ecer),
      hargaGrosir3: digits(typed[2]?.grosir),
    };
  };

  // --- Aksi ---
  const syncToolbar = (): void => {
    const cancelling = isEditing;
    const textNode = btnTambah.querySelector('span');
    if (textNode !== null) {
      textNode.textContent = cancelling ? TEXT.batal : sentenceCase(label('btnAksiTambah'));
    }
    const glyph = btnTambah.querySelector('svg');
    if (glyph !== null) {
      glyph.replaceWith(icon(cancelling ? 'x' : 'plus'));
    }
    btnTambah.title = cancelling ? 'Batal (Alt+T)' : 'Tambah (Alt+T)';
    btnTambah.setAttribute('aria-label', cancelling ? TEXT.batal : label('tambahBarang'));
    btnUbah.disabled = isEditing || productById(selectedId) === undefined;
    btnSimpan.disabled = !isEditing;
    openingAdd.disabled = isEditing || isNew || productById(selectedId) === undefined;
    openingImport.disabled = openingAdd.disabled;
  };
  const baseSetEnabled = setFormEnabled;
  setFormEnabled = (enabled: boolean): void => {
    baseSetEnabled(enabled);
    syncToolbar();
    renderOpening();
  };

  const cancelEditing = (): void => {
    const wasNew = isNew;
    isNew = false;
    const target = productById(selectedId) ?? (wasNew ? rows()[0] : undefined);
    selectedId = target?.id;
    fillForm(target);
    setFormEnabled(false);
    if (target !== undefined) {
      const index = rows().findIndex((item) => item.id === target.id);
      if (index >= 0) {
        grid.select(index);
      }
    }
  };

  btnTambah.addEventListener('click', () => {
    if (isEditing) {
      cancelEditing();
      return;
    }
    isNew = true;
    selectedId = undefined;
    fillForm(undefined);
    kode.control.value = nextProductCode(products());
    setFormEnabled(true);
    nama.control.focus();
    showToast({ kind: 'info', text: 'Silakan isi data barang baru' });
  });

  btnUbah.addEventListener('click', () => {
    if (productById(selectedId) === undefined) {
      showToast({ kind: 'info', text: TEXT.ubahDulu });
      return;
    }
    setFormEnabled(true);
    nama.control.focus();
    showToast({
      kind: 'info',
      text: 'Mode ubah aktif. Klik Simpan untuk menyimpan, Batal untuk keluar.',
    });
  });

  btnSimpan.addEventListener('click', () => {
    if (!isEditing) {
      showToast({ kind: 'info', text: TEXT.ubahDulu });
      return;
    }
    const draft = draftFromForm();
    if (draft === undefined) {
      return;
    }
    const result = session.saveProduct(draft, isNew ? undefined : selectedId);
    if (result.ok) {
      formError.textContent = '';
      unitPicker.markIssue(undefined);
      showToast({ kind: 'success', text: message('MSG-011') });
      selectedId = result.product.id;
      isNew = false;
      setFormEnabled(false);
      refreshList();
      fillForm(result.product);
      const index = rows().findIndex((item) => item.id === result.product.id);
      if (index >= 0) {
        grid.select(index);
      }
    } else if ('issue' in result) {
      formError.textContent = issueText(result.issue);
      if (result.issue.field === 'units') {
        unitPicker.markIssue({
          field: result.issue.labelKey === 'produkErrSatuanGanda' ? 'duplicate' : 'factor',
          row: result.issue.row,
        });
      } else {
        unitPicker.markIssue(undefined);
        const target: Readonly<Record<string, HTMLElement>> = {
          code: kode.control,
          codeLength: kode.control,
          name: nama.control,
          commission: komisi.control,
          promo: promo.control,
        };
        target[result.issue.field]?.focus();
      }
    }
  });

  btnNonaktif.addEventListener('click', () => {
    const target = productById(selectedId);
    if (!target) {
      showToast({ kind: 'info', text: 'Pilih barang yang ingin dihapus' });
      return;
    }
    openModal({
      title: label('nonaktifkanBarang'),
      body: label('nonaktifkanTeks', { kode: target.code }),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('nonaktifkan'),
          variant: 'danger',
          onClick: () => {
            session.deactivateProduct(target.id);
            showToast({ kind: 'success', text: 'Barang berhasil dinonaktifkan' });
            refreshList();
            fillForm(productById(target.id));
          },
        },
      ],
    });
  });

  // Keluar menutup tab Data Barang dan kembali ke tab sebelumnya.
  btnKeluar.addEventListener('click', () => {
    requestCloseTab(container);
  });

  // Info dan Cetak dimuat malas supaya layar Data Barang tetap kecil.
  btnInfo.addEventListener('click', () => {
    const target = productById(selectedId);
    if (target === undefined) {
      showToast({ kind: 'info', text: label('boPilihBarang') });
      return;
    }
    void import('./product-info').then(({ openProductInfo }) => {
      openProductInfo(session, target);
    });
  });

  btnImpor.addEventListener('click', () => {
    openModal({
      title: label('judulModalImpor'),
      body: 'Pilih opsi impor data barang massal via format Excel item-import apk.xlsx:',
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('btnMuatContohExcel'),
          variant: 'primary',
          onClick: () => {
            const sample = getSampleExcelProducts();
            const existingCodes = new Set(products().map((item) => item.code));
            const fresh = sample.filter((item) => !existingCodes.has(item.code));
            if (fresh.length === 0) {
              showToast({ kind: 'info', text: '10 SKU contoh sudah ada di dalam katalog.' });
              return;
            }
            fresh.forEach((item) => {
              store.saveProduct(item);
            });
            showToast({
              kind: 'success',
              text: label('pesanImporBerhasil', { jumlah: String(fresh.length) }),
            });
            selectedId = fresh[0]?.id;
            refreshList();
            fillForm(fresh[0]);
          },
        },
      ],
    });
  });

  btnCetak.addEventListener('click', () => {
    void import('./product-print').then(({ openProductPrint }) => {
      openProductPrint(session, products(), store.getState().role);
    });
  });

  btnRefresh.addEventListener('click', () => {
    query = '';
    searchInput.value = '';
    refreshList();
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    refreshList();
    // Baris teratas hasil pencarian ikut terpilih supaya formulir, Info, dan Cetak memakai barang
    // yang tampak tersorot. Isian yang sedang diubah tidak ditimpa.
    if (!isEditing && rows().length > 0) {
      grid.select(0);
    }
  });

  zoomButton.addEventListener('click', () => {
    const product = productById(selectedId);
    const url = previewUrl ?? (product === undefined ? undefined : productPhotoUrl(product));
    if (url === undefined) {
      return;
    }
    void import('./product-dialogs').then(({ openImageViewer }) => {
      openImageViewer(url, product?.name ?? label('boPerbesarFoto'));
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      photo = { name: file.name, bytes: file.size };
      showPhoto(undefined, URL.createObjectURL(file));
      showToast({ kind: 'info', text: `Foto dipilih: ${file.name}` });
    }
  });

  // --- Pintasan papan ketik (hanya saat tab Data Barang tampil) ---
  const onKey = (event: KeyboardEvent): void => {
    // Pintasan tidak berlaku saat modal (Info, Cetak, foto, konfirmasi) terbuka di atas layar.
    if (!screenActive(container) || document.querySelector('.modal-overlay') !== null) {
      return;
    }
    const key = event.key.toLowerCase();
    if (event.altKey && key === 't') {
      event.preventDefault();
      btnTambah.click();
    } else if (event.altKey && key === 'u') {
      event.preventDefault();
      btnUbah.click();
    } else if ((event.altKey && (key === 'r' || key === 's')) || (event.ctrlKey && key === 's')) {
      event.preventDefault();
      btnSimpan.click();
    } else if (event.altKey && key === 'h') {
      event.preventDefault();
      btnNonaktif.click();
    } else if (event.altKey && key === 'k') {
      event.preventDefault();
      btnKeluar.click();
    } else if (event.altKey && key === 'c') {
      event.preventDefault();
      btnCetak.click();
    } else if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      searchInput.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  // --- Susunan layar (gambar klien 37): bilah tombol dan pencarian, formulir lima kolom, daftar
  // barang selebar layar, lalu panel Harga dan Saldo Stok Awal berdampingan. ---
  const column = (className: string, ...children: (HTMLElement | false)[]): HTMLElement =>
    el('div', { className: `bo-pd-col ${className}` }, ...children);
  const satuanField = el(
    'div',
    { className: 'bo-pd-field' },
    el('span', { className: 'bo-pd-label', text: TEXT.satuan }),
    unitPicker.element,
  );
  const formSection = el(
    'section',
    { className: 'bo-pd-form', attrs: { 'aria-label': label('formBarang') } },
    column('bo-pd-col--a', nama.field, barcode.field, kategori.field, merk.field),
    column('bo-pd-col--b', satuanField, catatan.field),
    column('bo-pd-col--c', minAll.field, minToko.field, berat.field, kode.field),
    column('bo-pd-col--d', komisi.field, promo.field, rak.field),
    el('div', { className: 'bo-pd-col bo-pd-col--e' }, photoBox, count),
  );
  const openingPanel = el(
    'section',
    { className: 'bo-pd-opening', attrs: { 'aria-label': TEXT.saldoAwal } },
    el(
      'div',
      { className: 'bo-pd-opening__head' },
      el('h2', { className: 'bo-pd-opening__title', text: TEXT.saldoAwal }),
      isOwner ? el('div', { className: 'bo-pd-opening__tools' }, openingAdd, openingImport) : false,
    ),
    el(
      'div',
      {
        className: 'bo-pd-opening__scroll',
        attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.saldoAwal },
      },
      el('table', {}, el('thead', {}, openingHead), openingBody),
    ),
  );

  const container = el(
    'div',
    { className: 'bo-pd' },
    el(
      'div',
      { className: 'bo-pd-toolbar' },
      btnTambah,
      btnUbah,
      btnSimpan,
      btnNonaktif,
      btnInfo,
      btnCetak,
      btnKeluar,
      btnRefresh,
      btnImpor,
      searchInput,
    ),
    formError,
    formSection,
    el('div', { className: 'bo-pd-list' }, grid.element),
    el(
      'div',
      { className: 'bo-pd-bottom' },
      el('div', { className: 'bo-pd-prices' }, priceTable),
      openingPanel,
    ),
  );

  // --- Awal ---
  setFormEnabled(false);
  refreshList();
  const initial = rows()[0];
  if (initial) {
    selectedId = initial.id;
    fillForm(initial);
  } else {
    fillForm(undefined);
  }

  const stop = store.subscribe(() => {
    const online = store.getState().online;
    btnSimpan.toggleAttribute('data-inactive', !online);
    btnSimpan.setAttribute('aria-disabled', online ? 'false' : 'true');
  });

  return {
    element: container,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
