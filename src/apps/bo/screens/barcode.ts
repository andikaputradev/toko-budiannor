import '../../../styles/bo-trx.css';
import '../../../styles/bo-barcode.css';
import { el, nextId, type Child } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { SVG_NAMESPACE, icon } from '../../../shared/icons';
import { message } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { Product } from '../../../shared/data/types';
import type { BoSession } from '../bo-session';
import {
  BARCODE_HEIGHT,
  DEFAULT_COPIES,
  DEFAULT_MODEL,
  DEFAULT_PAPER,
  LABEL_MODELS,
  LABEL_PAPERS,
  MAX_COPIES,
  QR_SIZE,
  SAMPLE_LABEL,
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
  addEntry,
  barcodeDigits,
  barcodePath,
  buildSheet,
  clampSheet,
  defaultUnitOf,
  entryKey,
  initialEntries,
  labelDataOf,
  labelFace,
  modelOf,
  paperOf,
  paperTitle,
  parseCopies,
  qrPath,
  removeEntry,
  resolveEntries,
  sheetCount,
  totalLabels,
  unitChoices,
  type CopiesIssue,
  type LabelData,
  type LabelModel,
  type LabelModelId,
  type LabelPaper,
  type PaperId,
  type PrintEntry,
  type PrintItem,
} from '../domain/barcode-labels';
import { savedBarcodePrints } from '../domain/session-drafts';
import type { ScreenHandle } from './login';
import { createItemSearch } from './trx/item-search';

const SCREEN = 'BO-13';
const ACTION_PILIH = 'Pilih (kotak centang)';
const ACTION_LABEL = 'Label Barcode, Label Harga Rak';
const ACTION_CETAK = 'Cetak Label';

const TEXT = {
  opsiCetak: 'Opsi Pilihan Cetak',
  kertasLabel: 'Pilihan Kertas Label',
  isiData: 'Isi Data Barang',
  kodeNama: 'Kode / Nama Barang',
  hargaSatuan: 'Harga Satuan',
  jumlahCetakan: 'Jumlah Cetakan',
  kolom: 'Kolom',
  tambah: 'Tambah',
  simpan: 'Simpan',
  preview: 'Preview',
  cetak: 'Cetak',
  kode: 'Kode',
  barcode: 'Barcode',
  namaBarang: 'Nama Barang',
  satuan: 'Satuan',
  hargaJual: 'Harga Jual',
  jumlahCetak: 'Jumlah Cetak',
  hapus: 'Hapus',
  daftarCetak: 'Daftar cetak barcode',
  daftarKosong: 'Belum ada barang di daftar cetak. Cari barang, lalu klik Tambah.',
  pilihBarang: 'Cari dan pilih barang dulu, lalu klik Tambah.',
  ditambah: '{kode} ({satuan}) ditambahkan: {jumlah} label.',
  diganti: 'Jumlah cetak {kode} ({satuan}) diganti menjadi {jumlah}.',
  dihapus: '{kode} ({satuan}) dihapus dari daftar cetak.',
  hapusBaris: 'Hapus {kode} ({satuan}) dari daftar cetak',
  tersimpan: 'Daftar cetak tersimpan: {barang} barang, {jumlah} label.',
  daftarKosongToast: 'Daftar cetak masih kosong. Tambahkan barang dulu.',
  pratinjau: 'Pratinjau Cetak Barcode',
  ringkasan: '{kertas}, {model}, {jumlah} label',
  lembarKe: 'Lembar {no} dari {total}',
  sebelumnya: 'Sebelumnya',
  berikutnya: 'Berikutnya',
  tutup: 'Tutup',
  terkirim: '{jumlah} label dikirim ke printer.',
  galat: {
    kosong: 'Isi jumlah cetakan dulu.',
    'bukan-bulat': 'Jumlah cetakan harus bilangan bulat, tanpa koma atau huruf.',
    kurang: 'Jumlah cetakan paling sedikit 1.',
    'terlalu-banyak': `Jumlah cetakan paling banyak ${String(MAX_COPIES)}.`,
  } satisfies Record<CopiesIssue, string>,
} as const;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    template,
  );
}

function createSymbol(
  className: string,
  width: number,
  height: number,
  path: string,
  aspect: 'xMidYMid meet' | 'none',
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
  svg.setAttribute('preserveAspectRatio', aspect);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS(SVG_NAMESPACE, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

// Satu label menurut model: kode QR dan barcode garis dibuat palsu tetapi tetap (deterministik).
function createLabel(model: LabelModel, data: LabelData): HTMLElement {
  const face = labelFace(model, data);
  const digits = barcodeDigits(data);
  const children: Child[] = [];
  if (face.symbol === 'qr') {
    children.push(
      createSymbol('bo-bc-qr', QR_SIZE, QR_SIZE, qrPath(`${data.code}|${digits}`), 'xMidYMid meet'),
      el(
        'div',
        { className: 'bo-bc-label__text' },
        face.code !== undefined && el('span', { className: 'bo-bc-label__code', text: face.code }),
        el('span', { className: 'bo-bc-label__name', text: face.name }),
        face.price !== undefined &&
          el('strong', { className: 'bo-bc-label__price', text: face.price }),
      ),
    );
  } else {
    const bars = barcodePath(digits);
    children.push(
      face.head !== undefined && el('span', { className: 'bo-bc-label__head', text: face.head }),
      face.code !== undefined && el('span', { className: 'bo-bc-label__code', text: face.code }),
      el('span', { className: 'bo-bc-label__name', text: face.name }),
      createSymbol('bo-bc-bars', bars.width, BARCODE_HEIGHT, bars.path, 'none'),
      face.digits !== undefined &&
        el('span', { className: 'bo-bc-label__digits', text: face.digits }),
    );
  }
  return el(
    'div',
    { className: `bo-bc-label bo-bc-label--${face.symbol === 'qr' ? 'side' : 'stack'}` },
    el('div', { className: 'bo-bc-label__body' }, ...children),
  );
}

// Satu lembar kertas label dengan kisi sesuai kertas; label terisi berurutan per baris.
function createSheet(
  items: readonly PrintItem[],
  model: LabelModel,
  paper: LabelPaper,
  index: number,
): HTMLElement {
  const cells = buildSheet(items, paper, index);
  const sheet = el(
    'div',
    {
      className: 'bo-bc-sheet',
      attrs: { role: 'group', 'aria-label': `${paperTitle(paper)}, lembar ${String(index + 1)}` },
    },
    ...cells.map((cell) =>
      el(
        'div',
        { className: cell === undefined ? 'bo-bc-cell is-empty' : 'bo-bc-cell' },
        cell !== undefined && createLabel(model, cell),
      ),
    ),
  );
  sheet.style.setProperty('--bc-cols', String(paper.columns));
  sheet.style.setProperty('--bc-rows', String(paper.rows));
  sheet.style.setProperty('--bc-w-mm', String(SHEET_WIDTH_MM));
  sheet.style.setProperty('--bc-h-mm', String(SHEET_HEIGHT_MM));
  return sheet;
}

// Pemanggil di index.ts meneruskan `go` (pindah rute) seperti ke layar lain; halaman ini tidak
// berpindah rute, jadi argumen kedua diterima tetapi tidak dipakai.
type BarcodeScreenArgs = readonly [session: BoSession, go?: (path: string) => void];

export function renderBarcodeScreen(...[session]: BarcodeScreenArgs): ScreenHandle {
  const products = (): readonly Product[] => session.store.getState().data.products;
  const userKey = (): string => session.state().user?.id ?? 'umum';

  // Daftar, model, dan kertas dipulihkan dari simpanan sesi; tanpa simpanan dimulai dari contoh.
  const saved = savedBarcodePrints.get(userKey());
  let entries: readonly PrintEntry[] = saved?.entries ?? initialEntries(products());
  let modelId: LabelModelId = saved?.model ?? DEFAULT_MODEL;
  let paperId: PaperId = saved?.paper ?? DEFAULT_PAPER;
  // Barang yang sedang diisi pada "Isi Data Barang" dan baris daftar yang sedang disorot.
  let picked: Product | undefined;
  let selectedKey: string | undefined;
  let shown: readonly PrintItem[] = [];

  const deny = (): void => {
    showToast({ kind: 'error', text: message('MSG-003'), duration: 4000 });
  };

  // --- Opsi Pilihan Cetak: empat model dengan miniatur label ---
  const modelGroup = nextId('bc-model');
  const modelTitleId = nextId('bc-title');
  const minis = new Map<LabelModelId, HTMLElement>();
  const modelCards = LABEL_MODELS.map((model) => {
    const radio = el('input', {
      attrs: { type: 'radio', name: modelGroup, value: model.id, 'aria-label': model.name },
    });
    radio.checked = model.id === modelId;
    radio.addEventListener('change', () => {
      if (radio.checked) {
        modelId = model.id;
      }
    });
    const mini = el('div', { className: 'bo-bc-model__mini', attrs: { 'aria-hidden': 'true' } });
    minis.set(model.id, mini);
    return el(
      'label',
      { className: 'bo-bc-model' },
      el('span', { className: 'bo-bc-model__name', text: model.name }),
      radio,
      mini,
    );
  });

  // --- Pilihan Kertas Label ---
  const paperGroup = nextId('bc-paper');
  const paperTitleId = nextId('bc-title');
  const paperRows = LABEL_PAPERS.map((paper) => {
    const radio = el('input', {
      attrs: { type: 'radio', name: paperGroup, value: paper.id, 'aria-label': paperTitle(paper) },
    });
    radio.checked = paper.id === paperId;
    radio.addEventListener('change', () => {
      if (radio.checked) {
        paperId = paper.id;
      }
    });
    return el(
      'label',
      { className: 'bo-bc-paper' },
      radio,
      el('span', { text: paperTitle(paper), attrs: { 'aria-hidden': 'true' } }),
    );
  });

  // --- Isi Data Barang ---
  const searchId = nextId('bc-cari');
  const search = createItemSearch({
    products,
    onPick: (product) => {
      pickProduct(product);
    },
  });
  search.input.id = searchId;
  search.input.placeholder = '';
  search.input.setAttribute('aria-label', TEXT.kodeNama);

  const unitId = nextId('bc-satuan');
  const unitSelect = el('select', {
    className: 'input is-select bo-bc-unit',
    attrs: { id: unitId, 'aria-label': TEXT.hargaSatuan },
  });

  const copiesId = nextId('bc-jumlah');
  const copiesInput = el('input', {
    className: 'input is-num bo-bc-copies',
    attrs: {
      id: copiesId,
      type: 'number',
      min: '1',
      max: String(MAX_COPIES),
      step: '1',
      inputmode: 'numeric',
      value: String(DEFAULT_COPIES),
    },
  });

  const field = (caption: string, forId: string, ...control: Child[]): HTMLElement =>
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', attrs: { for: forId }, text: caption }),
      el('div', { className: 'bo-bc-control' }, ...control),
    );

  const btnTambah = createButton({
    text: TEXT.tambah,
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      addCurrent();
    },
  });
  const btnSimpan = createButton({
    text: TEXT.simpan,
    variant: 'secondary',
    icon: 'save',
    onClick: () => {
      saveList();
    },
  });
  const btnPreview = createButton({
    text: TEXT.preview,
    variant: 'secondary',
    icon: 'eye',
    onClick: () => {
      openPreview();
    },
  });
  const btnCetak = createButton({
    text: TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      if (!session.allowed(SCREEN, ACTION_CETAK)) {
        deny();
        return;
      }
      openPreview();
    },
  });

  // --- Tabel daftar cetak ---
  const tbody = el('tbody');
  const headCell = (text: string, className = ''): HTMLElement =>
    el('th', { className, attrs: { scope: 'col' }, text });
  const table = el(
    'table',
    { className: 'pos-table bo-bc-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        headCell(TEXT.kode, 'bo-bc-col--code'),
        headCell(TEXT.barcode, 'bo-bc-col--barcode'),
        headCell(TEXT.namaBarang),
        headCell(TEXT.satuan, 'bo-bc-col--unit'),
        headCell(TEXT.hargaJual, 'is-end bo-bc-col--price'),
        headCell(TEXT.jumlahCetak, 'is-center bo-bc-col--copies'),
        el(
          'th',
          { className: 'bo-bc-col--del', attrs: { scope: 'col' } },
          el('span', { className: 'visually-hidden', text: TEXT.hapus }),
        ),
      ),
    ),
    tbody,
  );

  // --- Miniatur: mengikuti barang yang diisi, atau baris yang disorot, atau contoh ---
  const currentLabel = (): LabelData => {
    if (picked !== undefined) {
      return labelDataOf(picked, unitSelect.value || defaultUnitOf(picked));
    }
    return shown.find((item) => item.key === selectedKey) ?? SAMPLE_LABEL;
  };

  const renderMinis = (): void => {
    const data = currentLabel();
    for (const model of LABEL_MODELS) {
      minis.get(model.id)?.replaceChildren(createLabel(model, data));
    }
  };

  const paintSelection = (): void => {
    for (const row of tbody.querySelectorAll<HTMLElement>('tr[data-key]')) {
      const on = row.dataset['key'] === selectedKey;
      row.classList.toggle('is-selected', on);
      if (on) {
        row.setAttribute('aria-current', 'true');
      } else {
        row.removeAttribute('aria-current');
      }
    }
  };

  const fillUnits = (product: Product, unit: string): void => {
    unitSelect.replaceChildren(
      ...unitChoices(product).map((choice) =>
        el('option', {
          text: `${choice.code} - ${formatRupiah(choice.price)}`,
          attrs: { value: choice.code },
        }),
      ),
    );
    unitSelect.value = unit;
  };

  function pickProduct(product: Product, unit?: string, copies?: number): void {
    picked = product;
    search.input.value = product.name;
    fillUnits(product, unit ?? defaultUnitOf(product));
    if (copies !== undefined) {
      copiesInput.value = String(copies);
    }
    copiesInput.removeAttribute('aria-invalid');
    if (unit === undefined) {
      // Barang baru dari kotak cari: sorotan baris lama dilepas supaya tidak menyesatkan.
      selectedKey = undefined;
      paintSelection();
    }
    renderMinis();
  }

  function clearPicked(): void {
    picked = undefined;
    unitSelect.replaceChildren();
    renderMinis();
  }

  const rowOf = (item: PrintItem): HTMLTableRowElement => {
    const code = el('button', {
      className: 'bo-bc-code',
      attrs: { type: 'button', title: item.name },
      text: item.code,
    });
    const remove = el(
      'button',
      {
        className: 'bo-bc-remove',
        attrs: {
          type: 'button',
          title: TEXT.hapus,
          'aria-label': fill(TEXT.hapusBaris, { kode: item.code, satuan: item.unit }),
        },
      },
      icon('trash-2'),
    );
    const row = el(
      'tr',
      { attrs: { 'data-key': item.key } },
      el('td', {}, code),
      el('td', { text: barcodeDigits(item) }),
      el('td', { className: 'bo-bc-name', text: item.name, attrs: { title: item.name } }),
      el('td', { text: item.unit }),
      el('td', { className: 'is-end', text: formatRupiah(item.price) }),
      el('td', { className: 'is-center', text: String(item.copies) }),
      el('td', { className: 'is-center' }, remove),
    );
    row.addEventListener('click', () => {
      selectRow(item);
    });
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeRow(item);
    });
    return row;
  };

  const renderTable = (): void => {
    shown = resolveEntries(entries, products());
    if (shown.length === 0) {
      tbody.replaceChildren(
        el(
          'tr',
          {},
          el('td', { className: 'bo-bc-empty', attrs: { colspan: '7' }, text: TEXT.daftarKosong }),
        ),
      );
      return;
    }
    tbody.replaceChildren(...shown.map(rowOf));
    paintSelection();
  };

  // Klik baris: isian "Isi Data Barang" terisi barang itu, jadi jumlahnya dapat diubah lewat Tambah.
  function selectRow(item: PrintItem): void {
    selectedKey = item.key;
    const product = products().find((candidate) => candidate.id === item.productId);
    if (product !== undefined) {
      pickProduct(product, item.unit, item.copies);
    }
    paintSelection();
    renderMinis();
  }

  function removeRow(item: PrintItem): void {
    if (!session.allowed(SCREEN, ACTION_PILIH)) {
      deny();
      return;
    }
    entries = removeEntry(entries, item.key);
    if (selectedKey === item.key) {
      selectedKey = undefined;
    }
    renderTable();
    renderMinis();
    showToast({ kind: 'info', text: fill(TEXT.dihapus, { kode: item.code, satuan: item.unit }) });
  }

  // Tambah: barang dan satuan yang sama digantikan jumlahnya (bukan dijumlahkan).
  function addCurrent(): void {
    if (!session.allowed(SCREEN, ACTION_PILIH)) {
      deny();
      return;
    }
    if (picked === undefined || unitSelect.value === '') {
      showToast({ kind: 'info', text: TEXT.pilihBarang, duration: 4000 });
      search.focus();
      return;
    }
    const parsed = parseCopies(copiesInput.value);
    if (!parsed.ok) {
      copiesInput.setAttribute('aria-invalid', 'true');
      showToast({ kind: 'error', text: TEXT.galat[parsed.issue], duration: 4000 });
      copiesInput.focus();
      return;
    }
    const entry: PrintEntry = {
      productId: picked.id,
      unit: unitSelect.value,
      copies: parsed.value,
    };
    const result = addEntry(entries, entry);
    entries = result.entries;
    selectedKey = entryKey(entry);
    const values = { kode: picked.code, satuan: entry.unit, jumlah: String(parsed.value) };
    picked = undefined;
    search.input.value = '';
    unitSelect.replaceChildren();
    copiesInput.removeAttribute('aria-invalid');
    renderTable();
    renderMinis();
    tbody.querySelector('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    showToast({
      kind: 'success',
      text: fill(result.replaced ? TEXT.diganti : TEXT.ditambah, values),
    });
    search.focus();
  }

  // Simpan: daftar, model, dan kertas disimpan pada sesi dan dipulihkan saat halaman dibuka lagi.
  function saveList(): void {
    if (!session.allowed(SCREEN, ACTION_LABEL)) {
      deny();
      return;
    }
    const items = resolveEntries(entries, products());
    if (items.length === 0) {
      showToast({ kind: 'info', text: TEXT.daftarKosongToast, duration: 4000 });
      return;
    }
    savedBarcodePrints.set(userKey(), { entries, model: modelId, paper: paperId });
    showToast({
      kind: 'success',
      text: fill(TEXT.tersimpan, {
        barang: String(items.length),
        jumlah: String(totalLabels(items)),
      }),
    });
  }

  // Cetak seluruh lembar lewat area cetak sementara; hanya area itu yang tampil di kertas.
  function printSheets(
    items: readonly PrintItem[],
    model: LabelModel,
    paper: LabelPaper,
    count: number,
    total: number,
  ): void {
    if (!session.allowed(SCREEN, ACTION_CETAK)) {
      deny();
      return;
    }
    const area = el('div', { className: 'bo-bc-print' });
    for (let index = 0; index < count; index += 1) {
      area.append(createSheet(items, model, paper, index));
    }
    document.body.append(area);
    document.body.classList.add('is-printing-label');
    try {
      window.print();
    } finally {
      document.body.classList.remove('is-printing-label');
      area.remove();
    }
    showToast({ kind: 'success', text: fill(TEXT.terkirim, { jumlah: String(total) }) });
  }

  // Preview dan Cetak memakai modal yang sama: lembar kertas berkisi, label berurutan per baris,
  // dan halaman Sebelumnya/Berikutnya bila label melebihi kapasitas satu lembar.
  function openPreview(): void {
    if (!session.allowed(SCREEN, ACTION_LABEL)) {
      deny();
      return;
    }
    const items = resolveEntries(entries, products());
    if (items.length === 0) {
      showToast({ kind: 'info', text: TEXT.daftarKosongToast, duration: 4000 });
      return;
    }
    const model = modelOf(modelId);
    const paper = paperOf(paperId);
    const total = totalLabels(items);
    const count = sheetCount(total, paper);
    let sheet = 0;

    const status = el('span', {
      className: 'bo-bc-preview__status',
      attrs: { 'aria-live': 'polite' },
    });
    const stage = el('div', { className: 'bo-bc-preview__stage' });
    const prev = createButton({
      text: TEXT.sebelumnya,
      variant: 'secondary',
      onClick: () => {
        show(sheet - 1);
      },
    });
    const next = createButton({
      text: TEXT.berikutnya,
      variant: 'secondary',
      onClick: () => {
        show(sheet + 1);
      },
    });
    function show(index: number): void {
      sheet = clampSheet(index, count);
      stage.replaceChildren(createSheet(items, model, paper, sheet));
      status.textContent = fill(TEXT.lembarKe, {
        no: String(sheet + 1),
        total: String(count),
      });
      prev.disabled = sheet === 0;
      next.disabled = sheet >= count - 1;
    }
    show(0);

    const body = el(
      'div',
      { className: 'bo-bc-preview' },
      el(
        'div',
        { className: 'bo-bc-preview__bar' },
        el('p', {
          className: 'bo-bc-preview__info',
          text: fill(TEXT.ringkasan, {
            kertas: paperTitle(paper),
            model: model.name,
            jumlah: String(total),
          }),
        }),
        el('div', { className: 'bo-bc-preview__pager' }, prev, status, next),
      ),
      stage,
    );
    openModal({
      title: TEXT.pratinjau,
      body,
      actions: [
        ...(session.allowed(SCREEN, ACTION_CETAK)
          ? [
              {
                text: TEXT.cetak,
                variant: 'primary' as const,
                icon: 'printer' as const,
                onClick: () => {
                  printSheets(items, model, paper, count, total);
                },
              },
            ]
          : []),
        { text: TEXT.tutup, variant: 'secondary' as const },
      ],
    });
  }

  search.input.addEventListener('input', () => {
    if (picked !== undefined && search.input.value !== picked.name) {
      clearPicked();
    }
  });
  search.input.addEventListener('focus', () => {
    search.input.select();
  });
  unitSelect.addEventListener('change', () => {
    renderMinis();
  });
  copiesInput.addEventListener('input', () => {
    copiesInput.removeAttribute('aria-invalid');
  });
  copiesInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCurrent();
    }
  });

  // --- Susunan layar (gambar klien 53): kartu atas tiga zona, tabel daftar di bawahnya ---
  const top = el(
    'section',
    { className: 'bo-bc-top', attrs: { 'aria-label': TEXT.daftarCetak } },
    el(
      'div',
      { className: 'bo-bc-zone bo-bc-zone--model' },
      el('h2', {
        className: 'bo-bc-zone__title',
        text: TEXT.opsiCetak,
        attrs: { id: modelTitleId },
      }),
      el(
        'div',
        {
          className: 'bo-bc-models',
          attrs: { role: 'radiogroup', 'aria-labelledby': modelTitleId },
        },
        ...modelCards,
      ),
    ),
    el(
      'div',
      { className: 'bo-bc-zone bo-bc-zone--paper' },
      el('h2', {
        className: 'bo-bc-zone__title',
        text: TEXT.kertasLabel,
        attrs: { id: paperTitleId },
      }),
      el(
        'div',
        {
          className: 'bo-bc-papers',
          attrs: { role: 'radiogroup', 'aria-labelledby': paperTitleId },
        },
        ...paperRows,
      ),
    ),
    el(
      'div',
      { className: 'bo-bc-zone bo-bc-zone--data' },
      el('h2', { className: 'bo-bc-zone__title', text: TEXT.isiData }),
      field(TEXT.kodeNama, searchId, search.root),
      field(TEXT.hargaSatuan, unitId, unitSelect),
      field(
        TEXT.jumlahCetakan,
        copiesId,
        copiesInput,
        el('span', { className: 'bo-bc-copies__unit', text: TEXT.kolom }),
      ),
      el('div', { className: 'bo-bc-actions' }, btnTambah, btnSimpan, btnPreview, btnCetak),
    ),
  );

  const list = el(
    'section',
    { className: 'bo-bc-list', attrs: { 'aria-label': TEXT.daftarCetak } },
    el(
      'div',
      {
        className: 'bo-bc-scroll',
        attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.daftarCetak },
      },
      table,
    ),
  );

  const container = el('div', { className: 'bo-bc' }, top, list);

  renderTable();
  renderMinis();

  return {
    element: container,
    destroy: () => undefined,
  };
}
