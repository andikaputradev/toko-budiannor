import type { LabelKey } from '../../../shared/messages';
import { entryFor } from './menu';

export const DASHBOARD_PATH = '/bo/dashboard';
export const MAX_TABS = 10;

export interface TabEntry {
  // Path tanpa query; satu tab per kunci.
  readonly key: string;
  // Path lengkap terakhir yang membuka tab (memuat query).
  readonly path: string;
}

export interface TabState {
  readonly tabs: readonly TabEntry[];
  readonly activeKey: string;
  // Kunci tab menurut pemakaian, paling baru di akhir. Dasar memilih tab yang dikeluarkan.
  readonly usedAt: readonly string[];
}

// Rute di luar menu memakai judul entri menu yang setara.
const TITLE_ALIASES: Readonly<Record<string, string>> = {
  '/bo/laporan/arus-kas': '/bo/akuntansi/arus-kas',
  '/bo/laporan/neraca': '/bo/akuntansi/neraca',
  '/bo/master/cetak-barcode': '/bo/pengaturan/barcode',
  '/bo/pengaturan/rekening': '/bo/master/rekening',
  '/bo/pengaturan/printer': '/bo/pengaturan/lainnya',
  '/bo/pengaturan/backup': '/bo/pengaturan/lainnya',
};

export function tabKey(path: string): string {
  const bare = path.split('?')[0] ?? path;
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}

const entryOf = (path: string): TabEntry => ({ key: tabKey(path), path });

export function initialTabs(path: string): TabState {
  const dashboard = entryOf(DASHBOARD_PATH);
  const current = entryOf(path);
  if (current.key === dashboard.key) {
    return { tabs: [current], activeKey: current.key, usedAt: [current.key] };
  }
  return {
    tabs: [dashboard, current],
    activeKey: current.key,
    usedAt: [dashboard.key, current.key],
  };
}

function touched(usedAt: readonly string[], key: string): readonly string[] {
  return [...usedAt.filter((item) => item !== key), key];
}

export function openTab(
  state: TabState,
  path: string,
): { state: TabState; evicted: readonly string[]; changedQuery: boolean } {
  const next = entryOf(path);
  const existing = state.tabs.find((tab) => tab.key === next.key);
  if (existing !== undefined) {
    return {
      state: {
        tabs: state.tabs.map((tab) => (tab.key === next.key ? next : tab)),
        activeKey: next.key,
        usedAt: touched(state.usedAt, next.key),
      },
      evicted: [],
      changedQuery: existing.path !== next.path,
    };
  }

  const tabs = [...state.tabs, next];
  const usedAt = touched(state.usedAt, next.key);
  if (tabs.length <= MAX_TABS) {
    return { state: { tabs, activeKey: next.key, usedAt }, evicted: [], changedQuery: false };
  }
  const victim = usedAt.find((key) => key !== DASHBOARD_PATH && key !== next.key);
  if (victim === undefined) {
    return { state: { tabs, activeKey: next.key, usedAt }, evicted: [], changedQuery: false };
  }
  return {
    state: {
      tabs: tabs.filter((tab) => tab.key !== victim),
      activeKey: next.key,
      usedAt: usedAt.filter((key) => key !== victim),
    },
    evicted: [victim],
    changedQuery: false,
  };
}

export function closeTab(
  state: TabState,
  key: string,
): { state: TabState; activate: TabEntry | undefined } {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index === -1 || key === DASHBOARD_PATH) {
    return { state, activate: undefined };
  }
  const tabs = state.tabs.filter((tab) => tab.key !== key);
  const usedAt = state.usedAt.filter((item) => item !== key);
  if (state.activeKey !== key) {
    return { state: { tabs, activeKey: state.activeKey, usedAt }, activate: undefined };
  }
  const neighbour = state.tabs[index + 1] ?? state.tabs[index - 1];
  const activeKey = neighbour?.key ?? DASHBOARD_PATH;
  return {
    state: { tabs, activeKey, usedAt: touched(usedAt, activeKey) },
    activate: neighbour,
  };
}

export function tabTitleKey(path: string): LabelKey | undefined {
  const key = tabKey(path);
  return (entryFor(key) ?? entryFor(TITLE_ALIASES[key] ?? ''))?.label;
}
