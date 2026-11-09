import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto } from '../../../shared/ui/product-photo';
import { showToast } from '../../../shared/ui/toast';
import { createVirtualGrid } from '../../../shared/ui/virtual-grid';
import type { BoSession } from '../bo-session';
import { BASE_UNITS, CODE_MAX, draftOf, type ProductDraft } from '../domain/product-form';
import { getSampleExcelProducts } from '../domain/import-excel';
import { findProducts } from '../search';
import type { ScreenHandle } from './login';

const CATEGORY_OPTIONS = [
  'DOOR & WINDOW',
  'BUILDING MATERIAL',
  'PAINT',
  'ELECTRICAL',
  'PLUMBING SANITARY',
  'POWER TOOLS',
  'CERAMIC',
  'FASTENER',
  'ACCESORIS TOOLS',
  'Bahan Dasar',
  'Pipa & Fitting',
  'Cat & Pelapis',
  'Kayu & Papan',
  'Atap & Plafon',
  'Lantai & Dinding',
  'Besi & Baja',
  'Alat Pertukangan',
  'Kelistrikan',
  'Kunci & Engsel',
  'Saniter & Dapur',
  'Baut & Mur',
];

const BRAND_OPTIONS = [
  'BELLUCCI',
  'GRESIK',
  'MAKITA',
  'ASIA TILE',
  'RUCIKA',
  'NIPPON PAINT',
  'ETERNA',
  'KODAI',
  'AMICO',
  'STEEL',
  'WD',
  'SES',
  'BROCO',
  'MASPION',
  'MILLIARD',
  'Tiga Roda',
  'Holcim',
  'Avian',
  'Dulux',
  'Mulia',
  'Roman',
  'Bosh',
  'Tekiro',
  'Panasonic',
  'Onda',
  'Toto',
];

// Teks tombol pada kamus berhuruf kapital; tampilkan sebagai kalimat biasa.
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function renderProducts(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  let query = '';
  let selectedId: string | undefined;
  let isNew = false;
  let isEditing = false;
  let photo = { name: '', bytes: 0 };
  let initialStockExpanded = false;

  const products = (): readonly Product[] => store.getState().data.products;
  const rows = (): readonly Product[] => findProducts(products(), query, products().length);
  const productById = (id: string | undefined): Product | undefined =>
    products().find((item) => item.id === id);

  // --- Top Action Bar ---
  const actionButton = (
    iconName: IconName,
    text: string,
    title: string,
    _shortcut: string | undefined,
    className = 'bo-btn-action',
    ariaLabel?: string,
  ): HTMLButtonElement =>
    el(
      'button',
      {
        className,
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
    'Alt+T',
    'bo-btn-action bo-btn-action--primary',
    label('tambahBarang'),
  );
  const btnRubah = actionButton(
    'save',
    sentenceCase(label('simpan')),
    'Simpan (Alt+S)',
    'Alt+S',
    'bo-btn-action',
    label('simpanBarang'),
  );
  const btnHapus = actionButton(
    'trash-2',
    sentenceCase(label('nonaktifkan')),
    'Nonaktifkan (Alt+H)',
    'Alt+H',
    'bo-btn-action bo-btn-action--danger',
    label('nonaktifkanBarang'),
  );
  btnHapus.style.display = session.allowed('BO-03', 'Nonaktifkan Barang') ? '' : 'none';
  const btnKeluar = actionButton(
    'log-out',
    sentenceCase(label('btnAksiKeluar')),
    'Keluar (Alt+K)',
    'Alt+K',
  );
  const btnInfo = actionButton('info', sentenceCase(label('btnAksiInfo')), 'Info SKU', undefined);
  const btnImpor = actionButton(
    'download',
    sentenceCase(label('btnAksiImpor')),
    'Impor Excel',
    undefined,
    'bo-btn-action bo-btn-action--accent',
  );

  const searchInput = el('input', {
    className: 'bo-product-search-input',
    attrs: {
      type: 'search',
      placeholder: label('placeholderCariBarang'),
      autocomplete: 'off',
      'aria-label': label('cari'),
    },
  });
  const btnRefresh = el(
    'button',
    { className: 'bo-product-refresh-btn', attrs: { type: 'button', 'aria-label': 'Refresh' } },
    icon('refresh-cw'),
  );
  const btnCetak = actionButton(
    'printer',
    sentenceCase(label('btnAksiCetak')),
    'Cetak (Alt+C)',
    'Alt+C',
  );

  // --- Form Elements (Left Panel) ---
  const inNama = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-nama', type: 'text', 'aria-label': label('namaBarang') },
  });
  const inKode = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-kode',
      type: 'text',
      maxLength: String(CODE_MAX),
      'aria-label': label('kodeBarang'),
    },
  });
  const inBarcode = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-barcode',
      type: 'text',
      inputMode: 'numeric',
      'aria-label': label('barcode'),
    },
  });
  const selKategori = el(
    'select',
    {
      className: 'bo-pform-select',
      attrs: { id: 'bo-pform-kategori', 'aria-label': label('kategori') },
    },
    ...CATEGORY_OPTIONS.map((c) => el('option', { text: c, attrs: { value: c } })),
  );
  const selMerk = el(
    'select',
    { className: 'bo-pform-select', attrs: { id: 'bo-pform-merk', 'aria-label': label('merek') } },
    ...BRAND_OPTIONS.map((b) => el('option', { text: b, attrs: { value: b } })),
  );
  const selSatuan = el(
    'select',
    {
      className: 'bo-pform-select',
      attrs: {
        id: 'bo-pform-satuan',
        'aria-label': label('satuanDasar'),
      },
    },
    el('option', { text: label('pilihSatuanDasar'), attrs: { value: '' } }),
    ...BASE_UNITS.map((unit) => el('option', { text: unit, attrs: { value: unit } })),
  );
  const formError = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const inSatuan2 = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-satuan2',
      type: 'text',
      placeholder: 'Contoh: LSN = 12 PSG',
      'aria-label': label('labelSatuan2'),
    },
  });
  const inSatuan3 = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-satuan3',
      type: 'text',
      placeholder: 'Contoh: DOS = 120 PSG',
      'aria-label': label('labelSatuan3'),
    },
  });
  const inMinStockAll = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-min-all',
      type: 'text',
      inputMode: 'decimal',
      'aria-label': label('labelMinStokAll'),
    },
  });
  const inMinStockToko = el('input', {
    className: 'bo-pform-input',
    attrs: {
      id: 'bo-pform-min-toko',
      type: 'text',
      inputMode: 'decimal',
      'aria-label': label('stokMinDisplay'),
    },
  });
  const inRak = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-rak', type: 'text', 'aria-label': label('labelNoRak') },
  });
  const inBerat = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-berat', type: 'text', 'aria-label': label('labelBeratBarang') },
  });
  const inKomisiSales = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-komisi', type: 'text', 'aria-label': label('labelKomisiSales') },
  });
  const inPromo = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-promo', type: 'text', 'aria-label': label('labelPromo') },
  });
  const inCatatan = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-catatan', type: 'text', 'aria-label': label('labelCatatanBarang') },
  });

  // Subpanel Supplier & HPP
  const inSupplier = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-supplier', type: 'text', 'aria-label': label('menuPemasok') },
  });
  const inTglBeliAkhir = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-tgl-beli', type: 'text', 'aria-label': label('labelTglBeliAkhir') },
  });
  const inHargaBeliAkhir = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-harga-beli', type: 'text', 'aria-label': label('labelHargaBeliAkhir') },
  });
  const inHppAvg = el('input', {
    className: 'bo-pform-input',
    attrs: { id: 'bo-pform-hpp-avg', type: 'text', 'aria-label': label('labelHppAvg') },
  });

  // Subpanel Saldo Awal
  const initialStockContent = el('div', { className: 'bo-initial-stock-body' });
  const toggleInitialStock = el(
    'button',
    { className: 'bo-initial-stock-header', attrs: { type: 'button' } },
    el('strong', { text: label('labelStokAwalHeader') }),
    el('span', { className: 'bo-initial-stock-sub', text: label('labelStokAwalSub') }),
  );

  // Photo
  const photoInputId = nextId('foto-bo');
  const fileInput = el('input', {
    className: 'bo-photo-file',
    attrs: { id: photoInputId, type: 'file', accept: 'image/*' },
  });
  const photoSlot = el('div', { className: 'bo-photo-slot' });
  const showPhoto = (product: Product | undefined, previewUrl?: string): void => {
    if (previewUrl !== undefined) {
      photoSlot.replaceChildren(
        el('img', { className: 'bo-product-img', attrs: { alt: '', src: previewUrl } }),
      );
    } else if (product !== undefined) {
      photoSlot.replaceChildren(createProductPhoto(product, 'lg'));
    } else {
      photoSlot.replaceChildren(
        el('span', { className: 'mob-photo mob-photo--lg mob-photo--empty' }, icon('package')),
      );
    }
  };
  showPhoto(undefined);
  const photoPlaceholder = el(
    'div',
    { className: 'bo-photo-box' },
    photoSlot,
    el('label', {
      className: 'bo-photo-upload-label',
      attrs: { for: photoInputId },
      text: 'Pilih / Ganti Foto',
    }),
    fileInput,
  );

  // --- Right Panel Elements ---
  const count = el('p', { className: 't-label bo-count', attrs: { 'aria-live': 'polite' } });
  const grid = createVirtualGrid<Product>({
    label: label('daftarBarang'),
    columns: [
      {
        header: 'NAMA BARANG',
        width: 'minmax(180px, 1.8fr)',
        cell: (p) => (p.active ? p.name : `${p.name} (Nonaktif)`),
      },
      { header: 'SATUAN', width: '80px', cell: (p) => p.baseUnit },
      {
        header: label('kolomStokTokoSingkat'),
        width: '85px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.display, 3, 1),
      },
      {
        header: label('kolomStokGdgSingkat'),
        width: '85px',
        align: 'end',
        cell: (p) => formatDecimal(p.stock.besar, 3, 1),
      },
      {
        header: label('kolomQtyPoSingkat'),
        width: '80px',
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

  const priceTbody = el('tbody');
  const priceTable = el(
    'table',
    { className: 'bo-price-matrix-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { className: 'col-unit', text: 'HARGA' }),
        el('th', { className: 'col-num', text: label('kolomHargaRetail') }),
        el('th', { className: 'col-num', text: label('kolomHargaGrosir') }),
      ),
    ),
    priceTbody,
  );

  const setFormEnabled = (enabled: boolean): void => {
    isEditing = enabled;
    const inputs = [
      inNama,
      inKode,
      inBarcode,
      selKategori,
      selMerk,
      selSatuan,
      inSatuan2,
      inSatuan3,
      inMinStockAll,
      inMinStockToko,
      inRak,
      inBerat,
      inKomisiSales,
      inPromo,
      inCatatan,
      inSupplier,
      inTglBeliAkhir,
      inHargaBeliAkhir,
      inHppAvg,
    ];
    inputs.forEach((input) => {
      input.disabled = !enabled;
    });
    btnRubah.classList.toggle('bo-btn-action--active', enabled);
    btnRubah.setAttribute('aria-label', 'Simpan Barang');
  };

  const fillForm = (product: Product | undefined): void => {
    if (product === undefined) {
      inNama.value = '';
      inKode.value = '';
      inBarcode.value = '';
      selKategori.value = CATEGORY_OPTIONS[0] ?? '';
      selMerk.value = BRAND_OPTIONS[0] ?? '';
      selSatuan.value = '';
      inSatuan2.value = '';
      inSatuan3.value = '';
      inMinStockAll.value = '';
      inMinStockToko.value = '';
      inRak.value = '';
      inBerat.value = '';
      inKomisiSales.value = '';
      inPromo.value = '';
      inCatatan.value = '';
      inSupplier.value = '';
      inTglBeliAkhir.value = '';
      inHargaBeliAkhir.value = '';
      inHppAvg.value = '';
      showPhoto(undefined);
      priceTbody.replaceChildren(
        el(
          'tr',
          {},
          el('td', { attrs: { colspan: '3' }, text: 'Pilih barang untuk melihat matriks harga' }),
        ),
      );
      initialStockContent.textContent = 'Tidak ada saldo awal tercatat';
      return;
    }

    const draft = draftOf(product);
    inNama.value = draft.name;
    inKode.value = draft.code;
    inBarcode.value = draft.barcode;
    selKategori.value = CATEGORY_OPTIONS.includes(draft.category)
      ? draft.category
      : (CATEGORY_OPTIONS[0] ?? '');
    selMerk.value = BRAND_OPTIONS.includes(draft.brand) ? draft.brand : (BRAND_OPTIONS[0] ?? '');
    selSatuan.value = draft.baseUnit;

    const u2 = product.units[1];
    inSatuan2.value = u2 ? `${u2.code} = ${u2.factor} ${product.baseUnit}` : '';
    const u3 = product.units[2];
    inSatuan3.value = u3 ? `${u3.code} = ${u3.factor} ${product.baseUnit}` : '';

    inMinStockAll.value = String(product.minStock);
    inMinStockToko.value = String(
      product.minByWarehouse?.display ?? Math.round(product.minStock * 0.4),
    );
    inRak.value = product.rak ?? '123A';
    inBerat.value = product.weight
      ? `${product.weight >= 1000 ? product.weight / 1000 : product.weight} ${product.weight >= 1000 ? 'KG' : 'GR'}`
      : '0,7 KG';

    const comm = product.salesCommission;
    inKomisiSales.value = comm
      ? `${comm.percent}%  |  ${formatRupiah(comm.nominal)}`
      : '1%  |  Rp 1.500';

    const prm = product.promo;
    inPromo.value =
      prm && prm.percent > 0
        ? `${prm.percent}%  |  ${formatRupiah(prm.nominal)}`
        : '20%  |  Rp 30.000';

    inCatatan.value = product.notes ?? 'BARANG STOK BANYAK, HARGA DISKON';

    inSupplier.value = product.supplierName ?? 'PT SEKAWAN JAYA';
    inTglBeliAkhir.value = product.lastPurchaseDate ?? '12-09-2026';
    inHargaBeliAkhir.value = formatDecimal(
      product.lastPurchasePrice ?? Math.round(product.hpp * 0.95),
    );
    inHppAvg.value = formatDecimal(product.hppAvg ?? product.hpp);

    // Photo preview
    showPhoto(product);

    // Matriks Harga
    const priceRows: HTMLElement[] = product.units.map((unit) => {
      const p = product.prices[unit.code];
      const ratioLabel =
        unit.factor > 1 ? `${unit.code} = ${unit.factor} ${product.baseUnit}` : unit.code;
      return el(
        'tr',
        {},
        el('td', { className: 'col-unit', text: ratioLabel }),
        el('td', { className: 'col-num', text: p ? formatDecimal(p.eceran) : '-' }),
        el('td', { className: 'col-num', text: p ? formatDecimal(p.grosir) : '-' }),
      );
    });
    priceTbody.replaceChildren(...priceRows);

    // Saldo awal details
    const initStk = product.initialStock;
    initialStockContent.replaceChildren(
      el(
        'div',
        { className: 'bo-initial-stock-grid' },
        el(
          'div',
          {},
          el('span', { className: 'bo-init-label', text: 'Tanggal Saldo:' }),
          el('strong', { text: initStk?.date ?? '01-01-2026' }),
        ),
        el(
          'div',
          {},
          el('span', { className: 'bo-init-label', text: 'Kuantitas Awal:' }),
          el('strong', {
            text: `${initStk?.quantity ?? product.stock.display + product.stock.besar} ${product.baseUnit}`,
          }),
        ),
        el(
          'div',
          {},
          el('span', { className: 'bo-init-label', text: 'Nilai Satuan:' }),
          el('strong', { text: formatRupiah(initStk?.unitPrice ?? product.hpp) }),
        ),
        el(
          'div',
          {},
          el('span', { className: 'bo-init-label', text: 'Gudang Display / Besar:' }),
          el('strong', { text: `${product.stock.display} / ${product.stock.besar}` }),
        ),
      ),
    );
  };

  const refreshList = (): void => {
    const list = rows();
    count.textContent = label('jumlahBarang', { jumlah: formatDecimal(list.length) });
    grid.setRows(list);
  };

  // Actions
  btnTambah.addEventListener('click', () => {
    isNew = true;
    selectedId = undefined;
    fillForm(undefined);
    setFormEnabled(true);
    inKode.value = '';
    inKode.focus();
    formError.textContent = '';
    showToast({ kind: 'info', text: 'Silakan isi data barang baru' });
  });

  btnRubah.addEventListener('click', () => {
    if (!isEditing) {
      if (selectedId === undefined && products().length > 0) {
        selectedId = products()[0]?.id;
        fillForm(productById(selectedId));
      }
      setFormEnabled(true);
      inNama.focus();
      showToast({ kind: 'info', text: 'Mode edit aktif. Tekan Simpan lagi untuk simpan.' });
      return;
    }

    // Simpan
    const draft: ProductDraft = {
      code: inKode.value,
      barcode: inBarcode.value,
      name: inNama.value,
      brand: selMerk.value,
      category: selKategori.value,
      baseUnit: selSatuan.value,
      allowDecimal: false,
      defaultUnit: selSatuan.value,
      minDisplay: inMinStockToko.value,
      minBesar: inMinStockAll.value,
      photoName: photo.name,
      photoBytes: photo.bytes,
      rak: inRak.value,
      berat: inBerat.value,
      catatan: inCatatan.value,
      supplierName: inSupplier.value,
      tglBeliAkhir: inTglBeliAkhir.value,
      hargaBeliAkhir: inHargaBeliAkhir.value.replace(/\D/g, ''),
      hppAvg: inHppAvg.value.replace(/\D/g, ''),
    };

    const res = session.saveProduct(draft, isNew ? undefined : selectedId);
    if (res.ok) {
      formError.textContent = '';
      showToast({ kind: 'success', text: message('MSG-011') });
      selectedId = res.product.id;
      isNew = false;
      setFormEnabled(false);
      refreshList();
      fillForm(res.product);
      const idx = rows().findIndex((p) => p.id === res.product.id);
      if (idx >= 0) {
        grid.select(idx);
      }
      btnHapus.style.display = session.allowed('BO-03', 'Nonaktifkan Barang') ? '' : 'none';
    } else if ('issue' in res) {
      const errText = res.issue.messageId
        ? message(res.issue.messageId)
        : 'Kode barang minimal 3 karakter.';
      formError.textContent = errText;
    }
  });

  btnHapus.addEventListener('click', () => {
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

  btnKeluar.addEventListener('click', () => {
    go('/bo/dashboard');
  });

  btnInfo.addEventListener('click', () => {
    const target = productById(selectedId);
    const skuTotal = products().length;
    openModal({
      title: 'Informasi Master Data Barang',
      body: `Total Terdaftar: ${skuTotal} SKU.\nBarang Aktif Saat Ini: ${target ? target.name + ' [' + target.code + ']' : 'Belum dipilih'}.\nLokasi Rak: ${target?.rak ?? '-'}\nTotal Stok: Display ${target?.stock.display ?? 0}, Gudang ${target?.stock.besar ?? 0}`,
      actions: [{ text: 'Tutup', variant: 'secondary' }],
    });
  });

  // Impor Modal
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
            const current = store.getState().data.products;
            const existingCodes = new Set(current.map((p) => p.code));
            const newToAdd = sample.filter((p) => !existingCodes.has(p.code));

            if (newToAdd.length === 0) {
              showToast({ kind: 'info', text: '10 SKU contoh sudah ada di dalam katalog.' });
              return;
            }

            newToAdd.forEach((p) => {
              store.saveProduct(p);
            });

            showToast({
              kind: 'success',
              text: label('pesanImporBerhasil', { jumlah: String(newToAdd.length) }),
            });
            selectedId = newToAdd[0]?.id;
            refreshList();
            fillForm(newToAdd[0]);
          },
        },
      ],
    });
  });

  btnCetak.addEventListener('click', () => {
    window.print();
  });

  btnRefresh.addEventListener('click', () => {
    query = '';
    searchInput.value = '';
    refreshList();
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    refreshList();
  });

  toggleInitialStock.addEventListener('click', () => {
    initialStockExpanded = !initialStockExpanded;
    initialStockContent.classList.toggle('bo-initial-stock-body--open', initialStockExpanded);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      photo = { name: file.name, bytes: file.size };
      const url = URL.createObjectURL(file);
      showPhoto(undefined, url);
      showToast({ kind: 'info', text: `Foto dipilih: ${file.name}` });
    }
  });

  // Shortcuts
  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      btnTambah.click();
    } else if (
      (event.altKey && (event.key.toLowerCase() === 'r' || event.key.toLowerCase() === 's')) ||
      (event.ctrlKey && event.key.toLowerCase() === 's')
    ) {
      event.preventDefault();
      btnRubah.click();
    } else if (event.altKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      btnHapus.click();
    } else if (event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      btnKeluar.click();
    } else if (event.altKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      btnCetak.click();
    } else if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      searchInput.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  // Layout Assembler (Mengikuti data-barang.png)
  const leftPanel = el(
    'section',
    { className: 'bo-product-left', attrs: { 'aria-label': label('formBarang') } },
    formError,
    photoPlaceholder,
    el(
      'div',
      { className: 'bo-pform-table' },
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', { className: 'bo-pform-lbl', attrs: { for: 'bo-pform-nama' }, text: 'NAMA' }),
        inNama,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', { className: 'bo-pform-lbl', attrs: { for: 'bo-pform-kode' }, text: 'KODE' }),
        inKode,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-barcode' },
          text: 'BARCODE',
        }),
        inBarcode,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-kategori' },
          text: 'KATEGORI',
        }),
        selKategori,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', { className: 'bo-pform-lbl', attrs: { for: 'bo-pform-merk' }, text: 'MERK' }),
        selMerk,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-satuan' },
          text: 'SATUAN',
        }),
        selSatuan,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-satuan2' },
          text: label('labelSatuan2'),
        }),
        inSatuan2,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-satuan3' },
          text: label('labelSatuan3'),
        }),
        inSatuan3,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-min-all' },
          text: label('labelMinStokAll'),
        }),
        inMinStockAll,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-min-toko' },
          text: label('labelMinStokTokoSingkat'),
        }),
        inMinStockToko,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-rak' },
          text: label('labelNoRak'),
        }),
        inRak,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-berat' },
          text: label('labelBeratBarang'),
        }),
        inBerat,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-komisi' },
          text: label('labelKomisiSales'),
        }),
        inKomisiSales,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-promo' },
          text: label('labelPromo'),
        }),
        inPromo,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-catatan' },
          text: label('labelCatatanBarang'),
        }),
        inCatatan,
      ),
    ),
    el(
      'div',
      { className: 'bo-pform-table bo-pform-table--supplier' },
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-supplier' },
          text: label('labelSuplier'),
        }),
        inSupplier,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-tgl-beli' },
          text: label('labelTglBeliAkhir'),
        }),
        inTglBeliAkhir,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-harga-beli' },
          text: label('labelHargaBeliAkhir'),
        }),
        inHargaBeliAkhir,
      ),
      el(
        'div',
        { className: 'bo-pform-row' },
        el('label', {
          className: 'bo-pform-lbl',
          attrs: { for: 'bo-pform-hpp-avg' },
          text: label('labelHppAvg'),
        }),
        inHppAvg,
      ),
    ),
    el('div', { className: 'bo-initial-stock-card' }, toggleInitialStock, initialStockContent),
  );

  const rightPanel = el(
    'section',
    { className: 'bo-product-right' },
    el('div', { className: 'bo-product-search-row' }, searchInput, btnRefresh),
    count,
    el(
      'div',
      {
        className: 'bo-product-table-wrapper',
        attrs: { tabindex: '0', 'aria-label': 'Daftar produk' },
      },
      grid.element,
    ),
    el(
      'div',
      {
        className: 'bo-price-matrix-wrapper',
        attrs: { tabindex: '0', 'aria-label': 'Matriks harga satuan' },
      },
      priceTable,
    ),
  );

  const container = el(
    'div',
    { className: 'bo-product-screen' },
    // Top Bar
    el(
      'div',
      { className: 'bo-product-topbar' },
      el(
        'div',
        { className: 'bo-product-actions-left' },
        btnTambah,
        btnRubah,
        btnHapus,
        btnKeluar,
        btnInfo,
        btnImpor,
        btnCetak,
      ),
    ),
    // Main Split
    el('div', { className: 'bo-product-split' }, leftPanel, rightPanel),
  );

  // Initialize
  setFormEnabled(false);
  refreshList();
  const initialSelected = rows()[0];
  if (initialSelected) {
    selectedId = initialSelected.id;
    fillForm(initialSelected);
    refreshList();
  }

  const stop = store.subscribe(() => {
    const online = store.getState().online;
    btnRubah.toggleAttribute('data-inactive', !online);
    btnRubah.setAttribute('aria-disabled', online ? 'false' : 'true');
  });

  return {
    element: container,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
