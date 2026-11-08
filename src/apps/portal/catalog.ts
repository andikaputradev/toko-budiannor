import type { LabelKey } from '../../shared/messages';

export type Ecosystem = 'pos' | 'bo' | 'mobile';

export interface ScreenEntry {
  readonly id: string;
  readonly title: LabelKey;
  readonly ecosystem: Ecosystem;
  readonly route: string | undefined;
  readonly parent: string | undefined;
  readonly hint: LabelKey | undefined;
  readonly built: boolean;
}

type Row = readonly [
  id: string,
  title: LabelKey,
  ecosystem: Ecosystem,
  route: string | undefined,
  parent: string | undefined,
  hint: LabelKey | undefined,
  built: boolean,
];

const ROWS: readonly Row[] = [
  ['POS-01', 'layarPos01', 'pos', '/pos', undefined, undefined, true],
  ['POS-02', 'layarPos02', 'pos', '/pos/jual', undefined, undefined, true],
  ['POS-03', 'layarPos03', 'pos', undefined, '/pos/jual', 'petunjukPos03', true],
  ['POS-04', 'layarPos04', 'pos', '/pos/bayar', undefined, undefined, true],
  ['POS-05', 'layarPos05', 'pos', '/pos/bill', undefined, undefined, true],
  ['POS-06', 'layarPos06', 'pos', '/pos/riwayat', undefined, undefined, true],
  ['POS-07', 'layarPos07', 'pos', '/pos/biaya', undefined, undefined, true],
  ['POS-08', 'layarPos08', 'pos', '/pos/pelanggan-baru', undefined, undefined, true],
  ['POS-09', 'layarPos09', 'pos', '/pos/status', undefined, undefined, true],
  ['POS-10', 'layarPos10', 'pos', undefined, '/pos/jual', 'petunjukPos10', true],
  ['POS-11', 'layarPos11', 'pos', undefined, undefined, undefined, false],
  ['BO-01', 'layarBo01', 'bo', '/bo', undefined, undefined, true],
  ['BO-02', 'layarBo02', 'bo', '/bo/dashboard', undefined, undefined, true],
  ['BO-03', 'layarBo03', 'bo', '/bo/barang', undefined, undefined, true],
  ['BO-04', 'layarBo04', 'bo', '/bo/harga', undefined, undefined, true],
  ['BO-05', 'layarBo05', 'bo', '/bo/stok', undefined, undefined, true],
  ['BO-06', 'layarBo06', 'bo', '/bo/mutasi', undefined, undefined, true],
  ['BO-07', 'layarBo07', 'bo', '/bo/opname', undefined, undefined, true],
  ['BO-08', 'layarBo08', 'bo', undefined, undefined, undefined, false],
  ['BO-09', 'layarBo09', 'bo', '/bo/penjualan', undefined, undefined, true],
  ['BO-10', 'layarBo10', 'bo', undefined, undefined, undefined, false],
  ['BO-11', 'layarBo11', 'bo', undefined, undefined, undefined, false],
  ['BO-12', 'layarBo12', 'bo', undefined, undefined, undefined, false],
  ['BO-13', 'layarBo13', 'bo', undefined, undefined, undefined, false],
  ['BO-14', 'layarBo14', 'bo', undefined, undefined, undefined, false],
  ['BO-15', 'layarBo15', 'bo', undefined, undefined, undefined, false],
  ['BO-16', 'layarBo16', 'bo', undefined, undefined, undefined, false],
  ['BO-17', 'layarBo17', 'bo', undefined, undefined, undefined, false],
  ['BO-18', 'layarBo18', 'bo', undefined, undefined, undefined, false],
  ['BO-19', 'layarBo19', 'bo', undefined, undefined, undefined, false],
  ['BO-20', 'layarBo20', 'bo', undefined, undefined, undefined, false],
  ['BO-21', 'layarBo21', 'bo', undefined, undefined, undefined, false],
  ['BO-22', 'layarBo22', 'bo', undefined, undefined, undefined, false],
  ['OWN-01', 'layarOwn01', 'mobile', '/owner', undefined, undefined, true],
  ['OWN-02', 'layarOwn02', 'mobile', '/owner/ringkasan', undefined, undefined, true],
  ['OWN-03', 'layarOwn03', 'mobile', '/owner/stok', undefined, undefined, true],
  ['OWN-04', 'layarOwn04', 'mobile', '/owner/laporan', undefined, undefined, true],
  ['OWN-05', 'layarOwn05', 'mobile', '/owner/piutang', undefined, undefined, true],
  ['OWN-06', 'layarOwn06', 'mobile', '/owner/transaksi', undefined, undefined, true],
  ['SALES-01', 'layarSales01', 'mobile', '/sales', undefined, undefined, true],
  ['SALES-02', 'layarSales02', 'mobile', '/sales/katalog', undefined, undefined, true],
  ['SALES-03', 'layarSales03', 'mobile', '/sales/order', undefined, undefined, true],
  ['SALES-04', 'layarSales04', 'mobile', undefined, '/sales/order', 'petunjukSales04', true],
  ['SALES-05', 'layarSales05', 'mobile', '/sales/riwayat', undefined, undefined, true],
];

export const SCREENS: readonly ScreenEntry[] = ROWS.map(
  ([id, title, ecosystem, route, parent, hint, built]) => ({
    id,
    title,
    ecosystem,
    route,
    parent,
    hint,
    built,
  }),
);

export const ECOSYSTEMS: readonly Ecosystem[] = ['pos', 'bo', 'mobile'];

export const ECOSYSTEM_LABELS: Readonly<Record<Ecosystem, LabelKey>> = {
  pos: 'ekosistemPos',
  bo: 'ekosistemBo',
  mobile: 'ekosistemMobile',
};

export const FRAME_SIZE: Readonly<
  Record<Ecosystem, { readonly width: number; readonly height: number }>
> = {
  pos: { width: 1280, height: 800 },
  bo: { width: 1440, height: 900 },
  mobile: { width: 360, height: 800 },
};

export function screenById(id: string): ScreenEntry | undefined {
  return SCREENS.find((entry) => entry.id === id);
}

export function openRoute(entry: ScreenEntry): string | undefined {
  return entry.route ?? entry.parent;
}

export function screenForHash(hash: string): string | undefined {
  const path = (hash.replace(/^#/, '').split('?')[0] ?? '').replace(/\/$/, '');
  return SCREENS.find((entry) => entry.route === path)?.id;
}

export function screensIn(ecosystem: Ecosystem): readonly ScreenEntry[] {
  return SCREENS.filter((entry) => entry.ecosystem === ecosystem);
}

export function builtIn(ecosystem: Ecosystem): number {
  return screensIn(ecosystem).filter((entry) => entry.built).length;
}

export interface FlowStep {
  readonly screen: string;
  readonly text: LabelKey;
}

export interface FlowEntry {
  readonly id: string;
  readonly title: LabelKey;
  readonly steps: readonly FlowStep[];
}

export const FLOWS: readonly FlowEntry[] = [
  {
    id: 'F-01',
    title: 'alurF01',
    steps: [
      { screen: 'POS-01', text: 'langkahF01a' },
      { screen: 'POS-02', text: 'langkahF01b' },
      { screen: 'POS-03', text: 'langkahF01c' },
      { screen: 'POS-04', text: 'langkahF01d' },
      { screen: 'POS-02', text: 'langkahF01e' },
    ],
  },
  {
    id: 'F-02',
    title: 'alurF02',
    steps: [
      { screen: 'POS-02', text: 'langkahF02a' },
      { screen: 'POS-04', text: 'langkahF02b' },
      { screen: 'BO-11', text: 'langkahF02c' },
    ],
  },
  {
    id: 'F-03',
    title: 'alurF03',
    steps: [
      { screen: 'POS-04', text: 'langkahF03a' },
      { screen: 'POS-10', text: 'langkahF03b' },
      { screen: 'BO-21', text: 'langkahF03c' },
    ],
  },
  {
    id: 'F-04',
    title: 'alurF04',
    steps: [
      { screen: 'POS-02', text: 'langkahF04a' },
      { screen: 'POS-05', text: 'langkahF04b' },
      { screen: 'POS-05', text: 'langkahF04c' },
      { screen: 'POS-02', text: 'langkahF04d' },
      { screen: 'POS-04', text: 'langkahF04e' },
    ],
  },
  {
    id: 'F-05',
    title: 'alurF05',
    steps: [
      { screen: 'POS-02', text: 'langkahF05a' },
      { screen: 'POS-09', text: 'langkahF05b' },
      { screen: 'BO-05', text: 'langkahF05c' },
    ],
  },
  {
    id: 'F-06',
    title: 'alurF06',
    steps: [
      { screen: 'BO-06', text: 'langkahF06a' },
      { screen: 'BO-06', text: 'langkahF06b' },
      { screen: 'BO-05', text: 'langkahF06c' },
    ],
  },
  {
    id: 'F-07',
    title: 'alurF07',
    steps: [
      { screen: 'BO-09', text: 'langkahF07a' },
      { screen: 'BO-12', text: 'langkahF07b' },
    ],
  },
  {
    id: 'F-08',
    title: 'alurF08',
    steps: [
      { screen: 'OWN-01', text: 'langkahF08a' },
      { screen: 'OWN-02', text: 'langkahF08b' },
      { screen: 'OWN-03', text: 'langkahF08c' },
      { screen: 'OWN-05', text: 'langkahF08d' },
      { screen: 'OWN-04', text: 'langkahF08e' },
    ],
  },
  {
    id: 'F-09',
    title: 'alurF09',
    steps: [
      { screen: 'OWN-01', text: 'langkahF09a' },
      { screen: 'OWN-06', text: 'langkahF09b' },
      { screen: 'POS-01', text: 'langkahF09c' },
      { screen: 'POS-05', text: 'langkahF09d' },
      { screen: 'POS-04', text: 'langkahF09e' },
      { screen: 'POS-06', text: 'langkahF09f' },
    ],
  },
  {
    id: 'F-10',
    title: 'alurF10',
    steps: [
      { screen: 'SALES-01', text: 'langkahF10a' },
      { screen: 'SALES-02', text: 'langkahF10b' },
      { screen: 'SALES-03', text: 'langkahF10c' },
      { screen: 'SALES-05', text: 'langkahF10d' },
      { screen: 'BO-01', text: 'langkahF10e' },
      { screen: 'BO-09', text: 'langkahF10f' },
      { screen: 'SALES-05', text: 'langkahF10g' },
    ],
  },
];

export function flowById(id: string | null): FlowEntry | undefined {
  return FLOWS.find((flow) => flow.id === id);
}

export function missingScreens(flow: FlowEntry): readonly string[] {
  const missing = flow.steps
    .map((step) => step.screen)
    .filter((id) => screenById(id)?.built !== true);
  return [...new Set(missing)];
}
