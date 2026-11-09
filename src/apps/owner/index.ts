import '../../styles/owner.css';
import '../../styles/tables.css';
import '../../styles/mobile.css';
import { label, message } from '../../shared/messages';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { createBanner } from '../../shared/ui/banner';
import { startAppearance } from '../../shared/ui/appearance';
import { closeAllModals } from '../../shared/ui/modal';
import { el } from '../../shared/dom';
import { createStorageVault } from './domain/auth';
import { createOwnerSession, type OwnerSession } from './owner-session';
import { renderLogin } from './screens/login';
import { renderSummary } from './screens/summary';
import type { ScreenHandle } from './screen';
import { createOwnerShell, type OwnerShell } from './shell';
import type { LabelKey } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';

export interface AppContext {
  readonly store: Store;
}

type Renderer = (
  session: OwnerSession,
  go: (path: string) => void,
  query: URLSearchParams,
  shell: OwnerShell,
) => ScreenHandle;

interface RouteEntry {
  readonly id: string;
  readonly title: LabelKey;
  readonly hero?: boolean;
  readonly render?: Renderer;
  readonly load?: () => Promise<Renderer>;
}

const ROUTES: Readonly<Record<string, RouteEntry>> = {
  '/owner/ringkasan': {
    id: 'OWN-02',
    title: 'navDashboard',
    hero: true,
    render: (session, go) => renderSummary(session, go),
  },
  '/owner/stok': {
    id: 'OWN-03',
    title: 'judulCekStok',
    load: async () => {
      const { renderStock } = await import('./screens/stock');
      return (session, go, query, shell) => renderStock(session, go, query, shell);
    },
  },
  '/owner/transaksi': {
    id: 'OWN-06',
    title: 'judulTransaksi',
    load: async () => {
      const { renderTransactions } = await import('./screens/transactions');
      return (session, go, query, shell) => renderTransactions(session, query, go, shell);
    },
  },
  '/owner/laporan': {
    id: 'OWN-04',
    title: 'judulLaporan',
    load: async () => {
      const { renderReports } = await import('./screens/reports');
      return (session, go, query, shell) => renderReports(session, query, go, shell);
    },
  },
  '/owner/piutang': {
    id: 'OWN-05',
    title: 'judulPiutang',
    load: async () => {
      const { renderReceivables } = await import('./screens/receivables');
      return (session, go, query, shell) => renderReceivables(session, query, go, shell);
    },
  },
};

let session: OwnerSession | undefined;
let screen: ScreenHandle | undefined;
let shell: OwnerShell | undefined;
let watched: Store | undefined;
let latest: { root: HTMLElement; path: string; context: AppContext } | undefined;
let mountToken = 0;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function sessionFor(store: Store): OwnerSession {
  if (session?.store !== store) {
    session = createOwnerSession(store, { vault: createStorageVault(storage()) });
  }
  return session;
}

export function mount(root: HTMLElement, fullPath: string, context: AppContext): void {
  latest = { root, path: fullPath, context };
  const [path = '/owner', search = ''] = fullPath.split('?');
  const query = new URLSearchParams(search);
  const active = sessionFor(context.store);
  document.documentElement.dataset['app'] = 'owner';
  startAppearance();
  if (watched !== context.store) {
    watched = context.store;
    context.store.bus.on('role', () => {
      if (latest !== undefined) {
        mount(latest.root, latest.path, latest.context);
      }
    });
  }
  const go = (target: string): void => {
    navigate(target);
  };

  screen?.destroy();
  shell?.destroy();
  screen = undefined;
  shell = undefined;
  closeAllModals();

  if (path === '/owner') {
    if (active.signedIn()) {
      navigate('/owner/ringkasan');
      return;
    }
    screen = renderLogin(active, go);
    root.replaceChildren(screen.element);
    return;
  }
  if (!active.signedIn()) {
    navigate('/owner');
    return;
  }
  const route = ROUTES[path];
  if (route === undefined) {
    navigate('/owner/ringkasan');
    return;
  }
  mountToken += 1;
  const token = mountToken;
  shell = createOwnerShell(active, path, route.title, go, { hero: route.hero === true });
  if (canOpenScreen(context.store.getState().role, route.id)) {
    if (route.render !== undefined) {
      screen = route.render(active, go, query, shell);
      shell.content.replaceChildren(screen.element);
    } else if (route.load !== undefined) {
      shell.content.replaceChildren(
        el('div', { className: 'own-loading', attrs: { role: 'status' } }, label('memuatData')),
      );
      void route.load().then((renderer) => {
        if (token === mountToken && shell !== undefined) {
          screen = renderer(active, go, query, shell);
          shell.content.replaceChildren(screen.element);
        }
      });
    }
  } else {
    shell.content.replaceChildren(
      el('div', { className: 'own-stack' }, createBanner('danger', message('MSG-118'))),
    );
  }
  root.replaceChildren(shell.element);
}
