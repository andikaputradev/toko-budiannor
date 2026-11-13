import '../../../styles/bo-products.css';
import { el, nextId } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { round3 } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto, productPhotoUrl } from '../../../shared/ui/product-photo';
import { showToast } from '../../../shared/ui/toast';
import { createVirtualGrid } from '../../../shared/ui/virtual-grid';
import type { BoSession } from '../bo-session';
import { getSampleExcelProducts } from '../domain/import-excel';
import { BRAND_OPTIONS, CATEGORY_OPTIONS } from '../domain/product-options';
import {
  CODE_MAX,
  draftOf,
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
  const btnTambah = actionButton(
    'plus',
    sentenceCase(label('btnAksiTambah')),
    'Tambah (Alt+T)',
    'bo-pd-btn--primary',
    label('tambahBarang'),
  );
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

  const nama = input('NAMA', label('namaBarang'));
  const kode = input('KODE', label('kodeBarang'), { maxLength: CODE_MAX });
  const barcode = input('BARCODE', label('barcode'), { inputMode: 'numeric' });
  const kategori = select('KATEGORI', label('kategori'), CATEGORY_OPTIONS);
  const merk = select('MERK', label('merek'), BRAND_OPTIONS);
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
  const minAll = input(label('labelMinStokAll'), label('labelMinStokAll'), {
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
      text: 'Pilih / Ganti Foto',
    }),
    fileInput,
  );

  // --- Daftar barang ---
  const count = el('p', { className: 'bo-pd-count', attrs: { 'aria-live': 'polite' } });
  const grid = createVirtualGrid<Product>({
    label: label('daftarBarang'),
    columns: [
      {
        header: 'NAMA BARANG',
        width: 'minmax(150px, 2fr)',
        cell: (p) => (p.active ? p.name : `${p.name} (Nonaktif)`),
      },
      { header: 'Satuan', width: '64px', cell: (p) => p.baseUnit },
      {
        header: label('kolomStokTokoSingkat'),
        width: '78px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.display, 3, 0),
      },
      {
        header: label('kolomStokGdgSingkat'),
        width: '86px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.besar, 3, 0),
      },
      {
        header: label('kolomQtyPoSingkat'),
        width: '72px',
        align: 'end',
        cell: (p) => formatDecimal(p.incoming ?? 0),
      },
    ],
    rows: rows(),
    onSelect: (item) => {
      selectedId = item.id;
      isNew = false;
      fillForm(item);
      setFormEnabled(false);
    },
  });

  // --- Matriks harga: mengikuti baris satuan; hanya bisa diisi saat Tambah barang baru ---
  const priceTable = el(
    'table',
    { attrs: { 'aria-label': label('boMatriksHarga') } },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: 'HARGA' }),
        el('th', { text: label('kolomHargaRetail') }),
        el('th', { text: label('kolomHargaGrosir') }),
      ),
    ),
    priceBody,
  );

  function renderMatrix(): void {
    const used = unitPicker.getRows().filter((row) => row.code !== '');
    if (used.length === 0) {
      priceBody.replaceChildren(
        el('tr', {}, el('td', { attrs: { colspan: '3' }, text: label('boPilihBarang') })),
      );
      return;
    }
    const product = productById(selectedId);
    const baseCode = used[0]?.code ?? '';
    const editable = isNew && isEditing;
    priceBody.replaceChildren(
      ...used.map((row, index) => {
        const name = index === 0 ? row.code : `${row.code} = ${row.factor || '?'} ${baseCode}`;
        const prices = isNew ? undefined : product?.prices[row.code];
        const cell = (kind: 'ecer' | 'grosir'): HTMLElement => {
          if (editable) {
            const heading = kind === 'ecer' ? label('kolomHargaRetail') : label('kolomHargaGrosir');
            const field = el('input', {
              className: 'bo-pd-prices__input',
              attrs: {
                type: 'text',
                inputmode: 'numeric',
                autocomplete: 'off',
                'aria-label': `${heading} ${row.code}`,
              },
            });
            field.value = typed[index]?.[kind] ?? '';
            field.addEventListener('input', () => {
              const slot = typed[index];
              if (slot !== undefined) {
                slot[kind] = field.value;
              }
            });
            return el('td', {}, field);
          }
          const value = kind === 'ecer' ? prices?.eceran : prices?.grosir;
          return el('td', { text: value === undefined ? '-' : formatDecimal(value, 0) });
        };
        return el('tr', {}, el('td', { text: name }), cell('ecer'), cell('grosir'));
      }),
    );
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

  const setFormEnabled = (enabled: boolean): void => {
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
  btnTambah.addEventListener('click', () => {
    isNew = true;
    selectedId = undefined;
    fillForm(undefined);
    setFormEnabled(true);
    kode.control.focus();
    showToast({ kind: 'info', text: 'Silakan isi data barang baru' });
  });

  btnSimpan.addEventListener('click', () => {
    if (!isEditing) {
      if (selectedId === undefined && products().length > 0) {
        selectedId = products()[0]?.id;
        fillForm(productById(selectedId));
      }
      setFormEnabled(true);
      nama.control.focus();
      showToast({ kind: 'info', text: 'Mode edit aktif. Tekan Simpan lagi untuk simpan.' });
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
    // Zoom 1x, 2x, dan 3x: lebar foto berubah lewat data-zoom (CSS), area foto menggulir bila meluap.
    const steps = [1, 2, 3] as const;
    let zoom = 0;
    const stage = el(
      'div',
      { className: 'bo-pd-zoom' },
      el('img', { attrs: { src: url, alt: product?.name ?? '' } }),
    );
    const zoomOut = createButton({
      text: label('perkecil'),
      variant: 'secondary',
      icon: 'zoom-out',
    });
    const zoomIn = createButton({ text: label('perbesar'), variant: 'secondary', icon: 'zoom-in' });
    const paintZoom = (): void => {
      stage.dataset['zoom'] = String(steps[zoom]);
      zoomOut.disabled = zoom === 0;
      zoomIn.disabled = zoom === steps.length - 1;
    };
    zoomOut.addEventListener('click', () => {
      zoom = Math.max(0, zoom - 1);
      paintZoom();
    });
    zoomIn.addEventListener('click', () => {
      zoom = Math.min(steps.length - 1, zoom + 1);
      paintZoom();
    });
    paintZoom();
    openModal({
      title: product?.name ?? label('boPerbesarFoto'),
      body: el(
        'div',
        { className: 'bo-pd-zoombox' },
        el('div', { className: 'bo-pd-zoombar' }, zoomOut, zoomIn),
        stage,
      ),
      actions: [{ text: label('tutup'), variant: 'secondary' }],
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

  // --- Susunan layar (gambar 3) ---
  const leftColumn = el(
    'div',
    { className: 'bo-pd-col' },
    nama.field,
    el('div', { className: 'bo-pd-row2' }, kode.field, barcode.field),
    el('div', { className: 'bo-pd-row2' }, kategori.field, merk.field),
    el('div', { className: 'bo-pd-row2' }, rak.field, berat.field),
    catatan.field,
    el('div', { className: 'bo-pd-row2' }, supplier.field, tglBeli.field),
    ...(isOwner ? [el('div', { className: 'bo-pd-row2' }, hargaBeli.field, hppAvg.field)] : []),
  );
  const rightColumn = el(
    'div',
    { className: 'bo-pd-col' },
    el(
      'div',
      { className: 'bo-pd-field' },
      el('span', { className: 'bo-pd-label', text: 'SATUAN' }),
      unitPicker.element,
    ),
    el('div', { className: 'bo-pd-row2' }, minAll.field, minToko.field),
    el('div', { className: 'bo-pd-row2' }, komisi.field, promo.field),
    photoBox,
  );

  const container = el(
    'div',
    { className: 'bo-pd' },
    el(
      'section',
      { className: 'bo-pd-form', attrs: { 'aria-label': label('formBarang') } },
      leftColumn,
      rightColumn,
    ),
    el(
      'section',
      { className: 'bo-pd-right' },
      el(
        'div',
        { className: 'bo-pd-toolbar' },
        btnTambah,
        btnSimpan,
        btnNonaktif,
        btnKeluar,
        btnInfo,
        btnCetak,
      ),
      formError,
      el('div', { className: 'bo-pd-searchrow' }, searchInput, btnRefresh, btnImpor),
      count,
      el('div', { className: 'bo-pd-list' }, grid.element),
      el('div', { className: 'bo-pd-prices' }, priceTable),
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
