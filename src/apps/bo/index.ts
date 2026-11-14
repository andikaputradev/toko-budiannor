import '../../styles/bo.css';
import '../../styles/tables.css';
import '../../styles/bo-sales.css';
import { el } from '../../shared/dom';
import { label, message } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { installUppercaseInputs } from '../../shared/uppercase-input';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import { closeAllModals } from '../../shared/ui/modal';
import { applyAppearance, loadMode, loadTheme, prefersDark, watchScheme } from '../../shared/theme';
import { createBoSession, type BoSession } from './bo-session';
import { entryFor } from './domain/menu';
import { renderDashboard } from './screens/dashboard';
import { renderLogin, type ScreenHandle } from './screens/login';
import { renderPlaceholder } from './screens/placeholder';
import { createShell, type Shell } from './shell';
import { importedSoNumbers, resetSessionDrafts } from './domain/session-drafts';
import { createWorkspace, type Workspace } from './workspace';
import '../../styles/bo-polish.css';
import '../../styles/bo-shell.css';
import '../../styles/bo-dashboard.css';
import '../../styles/bo-dashboard-widgets.css';
import '../../styles/bo-fit.css';

// Layar tanpa isian pengguna dan tanpa langganan store: dibangun ulang saat tabnya dibuka kembali
// setelah data berubah (lihat Freshness di workspace.ts).
const VIEW_ONLY_ROUTES: ReadonlySet<string> = new Set([
  '/bo/transaksi/daftar-nota',
  '/bo/laporan/penjualan',
  '/bo/laporan/pembelian',
]);

// Daftar PO dan SO berbagi rute dan tab dengan formulirnya (?baru=1 atau ?no=): hanya tampilan
// daftar yang tampil-saja.
const ORDER_LIST_ROUTES: ReadonlySet<string> = new Set([
  '/bo/transaksi/po-pembelian',
  '/bo/transaksi/so-penjualan',
]);

function isViewOnly(target: string): boolean {
  const [path = '', search = ''] = target.split('?');
  if (VIEW_ONLY_ROUTES.has(path)) {
    return true;
  }
  if (!ORDER_LIST_ROUTES.has(path)) {
    return false;
  }
  const query = new URLSearchParams(search);
  return query.get('baru') === null && query.get('no') === null;
}

export interface AppContext {
  readonly store: Store;
}

type Renderer = (
  session: BoSession,
  go: (path: string) => void,
  query: URLSearchParams,
) => ScreenHandle;

interface RouteEntry {
  readonly id: string;
  readonly render?: Renderer;
  readonly load?: () => Promise<Renderer>;
}

const ROUTES: Readonly<Record<string, RouteEntry>> = {
  '/bo/dashboard': { id: 'BO-02', render: (session) => renderDashboard(session) },
  '/bo/barang': {
    id: 'BO-03',
    load: async () => {
      const { renderProducts } = await import('./screens/products');
      return (session) => renderProducts(session);
    },
  },
  '/bo/harga': {
    id: 'BO-04',
    load: async () => {
      const { renderUnits } = await import('./screens/units');
      return (session, _go, query) => renderUnits(session, query);
    },
  },
  '/bo/stok': {
    id: 'BO-05',
    load: async () => {
      const { renderStock } = await import('./screens/stock');
      return (session, go, query) => renderStock(session, go, query);
    },
  },
  '/bo/mutasi': {
    id: 'BO-06',
    load: async () => {
      const { renderTransfer } = await import('./screens/transfer');
      return (session) => renderTransfer(session);
    },
  },
  '/bo/mutasi/koreksi': {
    id: 'BO-06',
    load: async () => {
      const { renderStockCorrection } = await import('./screens/stock-correction');
      return (session) => renderStockCorrection(session);
    },
  },
  '/bo/laporan/stok': {
    id: 'BO-16',
    load: async () => {
      const { renderStockReport } = await import('./screens/stock-report');
      return (session, go, query) => renderStockReport(session, go, query);
    },
  },
  '/bo/pengaturan/tema': {
    id: 'BO-22',
    load: async () => {
      const { renderThemeSettings } = await import('./screens/theme-settings');
      return (session) => renderThemeSettings(session);
    },
  },
  '/bo/opname': {
    id: 'BO-07',
    load: async () => {
      const { renderOpname } = await import('./screens/opname');
      return (session) => renderOpname(session);
    },
  },
  '/bo/penjualan': {
    id: 'BO-09',
    load: async () => {
      const { renderSalesForm } = await import('./screens/sales-form');
      return (session, go, query) => renderSalesForm(session, go, query.get('so') ?? undefined);
    },
  },
  '/bo/pembelian': {
    id: 'BO-08',
    load: async () => {
      const { renderPurchaseForm } = await import('./screens/purchase-form');
      return (session, go, query) => renderPurchaseForm(session, go, query.get('po') ?? undefined);
    },
  },
  '/bo/transaksi/surat-jalan': {
    id: 'BO-12',
    load: async () => {
      const { renderExpeditionForm } = await import('./screens/expedition-form');
      return (session, go, query) =>
        renderExpeditionForm(session, go, query.get('inv') ?? undefined);
    },
  },
  '/bo/transaksi/retur-penjualan': {
    id: 'BO-10',
    load: async () => {
      const { renderReturnForm } = await import('./screens/return-form');
      return (session, go) => renderReturnForm(session, go, 'penjualan');
    },
  },
  '/bo/transaksi/retur-pembelian': {
    id: 'BO-10',
    load: async () => {
      const { renderReturnForm } = await import('./screens/return-form');
      return (session, go) => renderReturnForm(session, go, 'pembelian');
    },
  },
  '/bo/transaksi/deposit-pelanggan': {
    id: 'BO-11',
    load: async () => {
      const { renderDeposit } = await import('./screens/deposit');
      return (session) => renderDeposit(session);
    },
  },
  '/bo/transaksi/daftar-nota': {
    id: 'BO-09',
    load: async () => {
      const { renderTransactionList } = await import('./screens/transaction-list');
      return (session, go, query) =>
        renderTransactionList(
          session,
          go,
          query.get('tab') === 'pembelian' ? 'pembelian' : 'penjualan',
        );
    },
  },
  '/bo/transaksi/so-penjualan': {
    id: 'BO-09',
    load: async () => {
      const [{ renderOrderList }, { renderOrderForm }] = await Promise.all([
        import('./screens/order-list'),
        import('./screens/order-form'),
      ]);
      // Daftar dan formulir berbagi satu tab: ?baru=1 atau ?no=NOMOR membuka formulir.
      return (session, go, query) =>
        query.get('baru') !== null || query.get('no') !== null
          ? renderOrderForm(session, go, 'so', query.get('no') ?? undefined)
          : renderOrderList(session, go, 'so');
    },
  },
  '/bo/transaksi/po-pembelian': {
    id: 'BO-08',
    load: async () => {
      const [{ renderOrderList }, { renderOrderForm }] = await Promise.all([
        import('./screens/order-list'),
        import('./screens/order-form'),
      ]);
      return (session, go, query) =>
        query.get('baru') !== null || query.get('no') !== null
          ? renderOrderForm(session, go, 'po', query.get('no') ?? undefined)
          : renderOrderList(session, go, 'po');
    },
  },
  '/bo/laporan/penjualan': {
    id: 'BO-16',
    load: async () => {
      const { renderTransactionList } = await import('./screens/transaction-list');
      return (session, go) => renderTransactionList(session, go, 'penjualan');
    },
  },
  '/bo/laporan/pembelian': {
    id: 'BO-16',
    load: async () => {
      const { renderTransactionList } = await import('./screens/transaction-list');
      return (session, go) => renderTransactionList(session, go, 'pembelian');
    },
  },
  '/bo/hutang-piutang/saldo-hutang': {
    id: 'BO-11',
    load: async () => {
      const { renderReceivablePayable } = await import('./screens/receivable-payable');
      return (session, go) => renderReceivablePayable(session, go, 'pemasok');
    },
  },
  '/bo/hutang-piutang/bayar-hutang': {
    id: 'BO-11',
    load: async () => {
      const { renderReceivablePayable } = await import('./screens/receivable-payable');
      return (session, go) => renderReceivablePayable(session, go, 'pemasok');
    },
  },
  '/bo/hutang-piutang/saldo-piutang': {
    id: 'BO-11',
    load: async () => {
      const { renderReceivablePayable } = await import('./screens/receivable-payable');
      return (session, go) => renderReceivablePayable(session, go, 'pelanggan');
    },
  },
  '/bo/hutang-piutang/bayar-piutang': {
    id: 'BO-11',
    load: async () => {
      const { renderReceivablePayable } = await import('./screens/receivable-payable');
      return (session, go) => renderReceivablePayable(session, go, 'pelanggan');
    },
  },
  '/bo/laporan/hutang-piutang': {
    id: 'BO-16',
    load: async () => {
      const { renderReceivablePayable } = await import('./screens/receivable-payable');
      return (session, go, query) =>
        renderReceivablePayable(
          session,
          go,
          query.get('tab') === 'pemasok' ? 'pemasok' : 'pelanggan',
        );
    },
  },
  '/bo/akuntansi/jurnal': {
    id: 'BO-18',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'jurnal');
    },
  },
  '/bo/akuntansi/beban': {
    id: 'BO-19',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'beban');
    },
  },
  '/bo/akuntansi/arus-kas': {
    id: 'BO-18',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'arus-kas');
    },
  },
  '/bo/akuntansi/laba-rugi': {
    id: 'BO-17',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'laba-rugi');
    },
  },
  '/bo/akuntansi/neraca': {
    id: 'BO-18',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'neraca');
    },
  },
  '/bo/laporan/laba-rugi': {
    id: 'BO-17',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'laba-rugi');
    },
  },
  '/bo/laporan/arus-kas': {
    id: 'BO-18',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'arus-kas');
    },
  },
  '/bo/laporan/neraca': {
    id: 'BO-18',
    load: async () => {
      const { renderAccountingScreen } = await import('./screens/accounting');
      return (session, go) => renderAccountingScreen(session, go, 'neraca');
    },
  },
  '/bo/pengaturan/barcode': {
    id: 'BO-13',
    load: async () => {
      const { renderBarcodeScreen } = await import('./screens/barcode');
      return (session, go) => renderBarcodeScreen(session, go);
    },
  },
  '/bo/master/kategori': {
    id: 'BO-03',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'kategori');
    },
  },
  '/bo/master/merk': {
    id: 'BO-03',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'merk');
    },
  },
  '/bo/master/pemasok': {
    id: 'BO-08',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'pemasok');
    },
  },
  '/bo/master/pelanggan': {
    id: 'BO-11',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'pelanggan');
    },
  },
  '/bo/master/sales': {
    id: 'BO-14',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'sales');
    },
  },
  '/bo/master/ekspedisi': {
    id: 'BO-12',
    load: async () => {
      const { renderMasterData } = await import('./screens/master-data');
      return (session, go) => renderMasterData(session, go, 'ekspedisi');
    },
  },
  '/bo/master/cetak-barcode': {
    id: 'BO-13',
    load: async () => {
      const { renderBarcodeScreen } = await import('./screens/barcode');
      return (session, go) => renderBarcodeScreen(session, go);
    },
  },
  '/bo/pengaturan/profil': {
    id: 'BO-22',
    load: async () => {
      const { renderSettingsScreen } = await import('./screens/settings');
      return (session, go) => renderSettingsScreen(session, go, 'profil');
    },
  },
  '/bo/pengaturan/rekening': {
    id: 'BO-22',
    load: async () => {
      const { renderSettingsScreen } = await import('./screens/settings');
      return (session, go) => renderSettingsScreen(session, go, 'rekening');
    },
  },
  '/bo/pengaturan/printer': {
    id: 'BO-22',
    load: async () => {
      const { renderSettingsScreen } = await import('./screens/settings');
      return (session, go) => renderSettingsScreen(session, go, 'printer');
    },
  },
  '/bo/pengaturan/backup': {
    id: 'BO-22',
    load: async () => {
      const { renderSettingsScreen } = await import('./screens/settings');
      return (session, go) => renderSettingsScreen(session, go, 'backup');
    },
  },
  '/bo/pengaturan/lainnya': {
    id: 'BO-22',
    load: async () => {
      const { renderSettingsScreen } = await import('./screens/settings');
      return (session, go) => renderSettingsScreen(session, go, 'profil');
    },
  },
  '/bo/pengaturan/pengguna': {
    id: 'BO-20',
    load: async () => {
      const { renderRbacScreen } = await import('./screens/rbac');
      return (session, go) => renderRbacScreen(session, go, 'pengguna');
    },
  },
  '/bo/pengaturan/hak-akses': {
    id: 'BO-20',
    load: async () => {
      const { renderRbacScreen } = await import('./screens/rbac');
      return (session, go) => renderRbacScreen(session, go, 'matriks');
    },
  },
  '/bo/pengaturan/audit-log': {
    id: 'BO-21',
    load: async () => {
      const { renderAuditLogScreen } = await import('./screens/audit-log');
      return (session, go) => renderAuditLogScreen(session, go);
    },
  },
};

let session: BoSession | undefined;
let loginScreen: ScreenHandle | undefined;
let shell: Shell | undefined;
let workspace: Workspace | undefined;
let watched: Store | undefined;
let latest: { root: HTMLElement; path: string; context: AppContext } | undefined;
let stopWatchingTheme: (() => void) | undefined;

function sessionFor(store: Store): BoSession {
  if (session?.store !== store) {
    session = createBoSession(store);
  }
  return session;
}

function denied(active: BoSession, go: (path: string) => void): HTMLElement {
  const role = active.store.getState().role;
  const canDashboard = canOpenScreen(role, 'BO-02');
  return el(
    'div',
    { className: 'bo-denied' },
    createBanner('danger', message('MSG-003')),
    createButton({
      text: label(canDashboard ? 'kembaliKeDashboard' : 'keluar'),
      onClick: () => {
        if (canDashboard) {
          go('/bo/dashboard');
        } else {
          active.logout();
          go('/bo');
        }
      },
    }),
  );
}

// Seluruh tab dan layarnya dibuang bersama kerangkanya: saat Keluar, ganti peran, atau ganti sesi.
function disposeWorkspace(): void {
  resetSessionDrafts();
  workspace?.destroy();
  shell?.destroy();
  workspace = undefined;
  shell = undefined;
}

// Membangun layar untuk satu tab. Layar yang ditolak hak aksesnya tampil sebagai panel penolakan.
function buildScreen(
  active: BoSession,
  go: (path: string) => void,
  fullPath: string,
): Promise<ScreenHandle> {
  const [path = '/bo', search = ''] = fullPath.split('?');
  const query = new URLSearchParams(search);
  const explicitRoute = ROUTES[path];
  const screenId = explicitRoute ? explicitRoute.id : (entryFor(path)?.screenId ?? 'BO-02');
  if (!canOpenScreen(active.store.getState().role, screenId)) {
    return Promise.resolve({ element: denied(active, go), destroy: () => undefined });
  }
  if (explicitRoute?.render !== undefined) {
    return Promise.resolve(explicitRoute.render(active, go, query));
  }
  if (explicitRoute?.load !== undefined) {
    return explicitRoute.load().then((renderer) => renderer(active, go, query));
  }
  return Promise.resolve(renderPlaceholder(path, go));
}

export function mount(root: HTMLElement, fullPath: string, context: AppContext): void {
  latest = { root, path: fullPath, context };
  const [path = '/bo'] = fullPath.split('?');
  const previous = session;
  const active = sessionFor(context.store);
  if (previous !== undefined && previous !== active) {
    disposeWorkspace();
  }
  document.documentElement.dataset['app'] = 'bo';
  installUppercaseInputs();

  // Sinkronisasi tema POS ke Back-Office
  const currentTheme = loadTheme();
  const currentMode = loadMode();
  applyAppearance(document.documentElement, currentTheme, currentMode, prefersDark());

  stopWatchingTheme ??= watchScheme((dark) => {
    applyAppearance(document.documentElement, loadTheme(), loadMode(), dark);
  });

  if (watched !== context.store) {
    watched = context.store;
    context.store.bus.on('role', () => {
      if (latest !== undefined) {
        disposeWorkspace();
        mount(latest.root, latest.path, latest.context);
      }
    });
  }
  const go = (target: string): void => {
    navigate(target);
  };

  loginScreen?.destroy();
  loginScreen = undefined;

  if (path === '/bo') {
    disposeWorkspace();
    closeAllModals();
    loginScreen = renderLogin(active, go);
    root.replaceChildren(loginScreen.element);
    loginScreen.element.querySelector<HTMLInputElement>('.bo-login__input')?.focus();
    return;
  }
  if (active.state().user === undefined && context.store.getState().reviewMode) {
    active.login('sinta.spv', 'Kunci2026B');
  }
  if (active.state().user === undefined) {
    disposeWorkspace();
    navigate('/bo');
    return;
  }
  if (ROUTES[path] === undefined && entryFor(path) === undefined) {
    navigate('/bo/dashboard');
    return;
  }

  // Kerangka dan tab dipertahankan selama pengguna berpindah halaman di Back-Office. Bila akar
  // aplikasi diganti (pengguna sempat membuka aplikasi lain), mulai dari kerangka baru.
  if (workspace === undefined || shell?.element.parentElement !== root) {
    disposeWorkspace();
    const created = createShell(active, go);
    shell = created;
    const { store } = context;
    workspace = createWorkspace(created, go, (target) => buildScreen(active, go, target), {
      viewOnly: isViewOnly,
      stamp: () => {
        const state = store.getState();
        return [
          state.data,
          state.salesOrders,
          state.purchaseOrders,
          state.returnNotes,
          state.depositEntries,
          state.activity,
          // SO yang diimpor ke faktur mengubah status di Daftar SO tanpa mengubah store.
          importedSoNumbers.size,
        ];
      },
    });
    root.replaceChildren(created.element);
  }
  workspace.show(fullPath);
}
