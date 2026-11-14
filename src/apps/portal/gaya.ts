import { el } from '../../shared/dom';
import { formatDecimal, formatRupiah } from '../../shared/format';
import { label, message, type LabelKey } from '../../shared/messages';
import { BADGE_KINDS, createBadge } from '../../shared/ui/badge';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import { createChip } from '../../shared/ui/chip';
import { createEmptyState } from '../../shared/ui/empty';
import { createSelectField, createTextField } from '../../shared/ui/field';
import { openModal } from '../../shared/ui/modal';
import { createPinPad } from '../../shared/ui/pinpad';
import { createSkeleton } from '../../shared/ui/skeleton';
import { createTabs } from '../../shared/ui/tabs';
import { createVirtualTable } from '../../shared/ui/table';
import { showToast } from '../../shared/ui/toast';
import { createSampleItems, type SampleItem } from './sample-data';

type FrameKind = 'pos' | 'bo' | 'owner';

interface FrameSpec {
  readonly kind: FrameKind;
  readonly theme: 'light' | 'dark' | undefined;
  readonly title: LabelKey;
}

const FRAMES: readonly FrameSpec[] = [
  { kind: 'pos', theme: undefined, title: 'frameJudulPos' },
  { kind: 'bo', theme: undefined, title: 'frameJudulBo' },
  { kind: 'owner', theme: 'light', title: 'frameJudulOwnerTerang' },
  { kind: 'owner', theme: 'dark', title: 'frameJudulOwnerGelap' },
];

const ITEM_COUNT = 3600;

function section(title: LabelKey, ...content: Node[]): HTMLElement {
  return el(
    'section',
    { className: 'specimen' },
    el('h3', { className: 't-section-title', text: label(title) }),
    ...content,
  );
}

function row(...content: Node[]): HTMLDivElement {
  return el('div', { className: 'specimen__row' }, ...content);
}

function buttonSection(kind: FrameKind): HTMLElement {
  const simpan = label('simpan');
  const rows = [
    row(
      createButton({ text: simpan, icon: 'save' }),
      createButton({ text: simpan, icon: 'save', pressed: true }),
      createButton({ text: simpan, icon: 'save', disabled: true }),
      createButton({ text: simpan, loading: true }),
    ),
    row(
      createButton({ text: label('cetak'), icon: 'printer', variant: 'secondary' }),
      createButton({ text: label('cetak'), icon: 'printer', variant: 'secondary', disabled: true }),
      createButton({ text: label('hapus'), icon: 'trash-2', variant: 'danger' }),
      createButton({ text: label('hapus'), icon: 'trash-2', variant: 'danger', disabled: true }),
    ),
  ];
  if (kind === 'pos') {
    rows.push(
      row(createButton({ text: label('tahanBill'), icon: 'pause', variant: 'secondary' })),
      el(
        'div',
        { className: 'specimen__pay' },
        createButton({ text: label('bayar'), icon: 'banknote', pay: true }),
      ),
    );
  }
  return section('bagianTombol', ...rows);
}

function inputSection(): HTMLElement {
  const jumlah = createTextField({
    labelText: label('jumlah'),
    value: '0',
    error: message('MSG-029'),
    inputMode: 'decimal',
  });
  const nama = createTextField({ labelText: label('kolomNamaBarang') });
  const kunci = createTextField({ labelText: label('kolomKode'), value: 'B0001', disabled: true });
  const kategori = createSelectField({
    labelText: label('kategoriHarga'),
    value: 'eceran',
    options: [
      { value: 'eceran', text: label('tierEceran') },
      { value: 'grosir', text: label('tierGrosir') },
    ],
  });
  return section(
    'bagianInput',
    el('div', { className: 'specimen__stack' }, nama.root, jumlah.root, kunci.root, kategori.root),
  );
}

function chipSection(): HTMLElement {
  const group = el(
    'div',
    {
      className: 'specimen__row',
      attrs: { role: 'group', 'aria-label': label('kategoriHarga') },
    },
    createChip({ text: label('semua'), selected: true }),
    createChip({ text: label('tierEceran') }),
    createChip({ text: label('tierGrosir') }),
  );
  return section('bagianChip', group);
}

function bannerSection(): HTMLElement {
  return section(
    'bagianBanner',
    el(
      'div',
      { className: 'specimen__stack' },
      createBanner('info', message('MSG-057')),
      createBanner('warning', message('MSG-067')),
      createBanner('danger', message('MSG-002')),
      createBanner('offline', message('MSG-004', { antrean: 3 })),
    ),
  );
}

function badgeSection(): HTMLElement {
  return section('bagianLencana', row(...BADGE_KINDS.map((kind) => createBadge(kind))));
}

function tableSection(items: readonly SampleItem[]): HTMLElement {
  const table = createVirtualTable<SampleItem>({
    label: label('tabelContoh'),
    rows: items,
    columns: [
      { header: label('kolomKode'), width: '72px', cell: (item) => item.code },
      { header: label('kolomNamaBarang'), width: 'minmax(0, 1fr)', cell: (item) => item.name },
      {
        header: label('kolomStok'),
        width: '72px',
        align: 'end',
        cell: (item) => formatDecimal(item.stock),
      },
      {
        header: label('kolomHarga'),
        width: '104px',
        align: 'end',
        cell: (item) => formatRupiah(item.price),
      },
    ],
  });
  return section('bagianTabel', table);
}

function pinSection(): HTMLElement {
  const hint = el('p', { className: 't-label', text: message('MSG-022') });
  return section('bagianPin', hint, createPinPad().element);
}

function tabSection(): HTMLElement {
  const panel = (value: number): HTMLElement =>
    el('p', { className: 't-value', text: formatRupiah(value) });
  return section(
    'bagianTab',
    createTabs(label('kategoriHarga'), [
      { text: label('tierEceran'), panel: panel(1337000) },
      { text: label('tierGrosir'), panel: panel(1250000) },
    ]),
  );
}

function emptySection(): HTMLElement {
  return section('bagianKosong', createEmptyState({ icon: 'search', title: message('MSG-006') }));
}

function skeletonSection(): HTMLElement {
  return section('bagianKerangka', createSkeleton());
}

function overlaySection(frame: HTMLElement): HTMLElement {
  const toast = (kind: 'success' | 'info' | 'error', text: string, name: LabelKey): HTMLElement =>
    createButton({
      text: label(name),
      variant: 'secondary',
      onClick: () => {
        showToast({ kind, text, scopeFrom: frame });
      },
    });
  const modalButton = createButton({
    text: label('tombolBukaModal'),
    variant: 'secondary',
    onClick: () => {
      openModal({
        title: label('modalJudulHapus'),
        body: message('MSG-015'),
        scopeFrom: frame,
        actions: [
          { text: label('batal'), variant: 'secondary' },
          { text: label('hapus'), variant: 'danger' },
        ],
      });
    },
  });
  return section(
    'bagianModalToast',
    row(
      modalButton,
      toast('success', message('MSG-008', { nomor: 'B-0003' }), 'tombolToastSukses'),
      toast('info', message('MSG-009'), 'tombolToastInfo'),
      toast('error', message('MSG-018'), 'tombolToastError'),
    ),
  );
}

function renderFrame(spec: FrameSpec, items: readonly SampleItem[]): HTMLElement {
  const frame = el('section', {
    className: 'frame',
    attrs: { 'data-app': spec.kind, 'data-theme': spec.theme },
  });
  const heading = el('h2', { className: 't-screen-title', text: label(spec.title) });
  frame.append(
    heading,
    el(
      'div',
      { className: 'frame__body' },
      buttonSection(spec.kind),
      inputSection(),
      chipSection(),
      bannerSection(),
      badgeSection(),
      tableSection(items),
      pinSection(),
      tabSection(),
      emptySection(),
      skeletonSection(),
      overlaySection(frame),
    ),
  );
  return frame;
}

export function renderGaya(root: HTMLElement): void {
  const items = createSampleItems(ITEM_COUNT);
  const main = el(
    'main',
    { className: 'gaya' },
    el('h1', { className: 't-screen-title', text: label('gayaJudul') }),
    ...FRAMES.map((spec) => renderFrame(spec, items)),
  );
  root.replaceChildren(main);
}
