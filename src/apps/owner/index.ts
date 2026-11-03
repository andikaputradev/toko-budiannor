import '../../styles/owner.css';
import '../../styles/tables.css';
import { message } from '../../shared/messages';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { createBanner } from '../../shared/ui/banner';
import { el } from '../../shared/dom';
import { createStorageVault } from './domain/auth';
import { createOwnerSession, type OwnerSession } from './owner-session';
import { renderLogin } from './screens/login';
import { renderReceivables } from './screens/receivables';
import { renderReports } from './screens/reports';
import { renderStock } from './screens/stock';
import { renderSummary } from './screens/summary';
import { renderTransactions } from './screens/transactions';
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
) => ScreenHandle;

const ROUTES: Readonly<
  Record<string, { readonly id: string; readonly title: LabelKey; readonly render: Renderer }>
> = {
  '/owner/ringkasan': {
    id: 'OWN-02',
    title: 'judulRingkasan',
    render: (session) => renderSummary(session),
  },
  '/owner/stok': {
    id: 'OWN-03',
    title: 'judulCekStok',
    render: (session, go) => renderStock(session, go),
  },
  '/owner/transaksi': {
    id: 'OWN-06',
    title: 'judulTransaksi',
    render: (session, _go, query) => renderTransactions(session, query),
  },
  '/owner/laporan': {
    id: 'OWN-04',
    title: 'judulLaporan',
    render: (session) => renderReports(session),
  },
  '/owner/piutang': {
    id: 'OWN-05',
    title: 'judulPiutang',
    render: (session) => renderReceivables(session),
  },
};

let session: OwnerSession | undefined;
let screen: ScreenHandle | undefined;
let shell: OwnerShell | undefined;
let watched: Store | undefined;
let latest: { root: HTMLElement; path: string; context: AppContext } | undefined;

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
  shell = createOwnerShell(active, path, route.title, go);
  if (canOpenScreen(context.store.getState().role, route.id)) {
    screen = route.render(active, go, query);
    shell.content.replaceChildren(screen.element);
  } else {
    shell.content.replaceChildren(
      el('div', { className: 'own-stack' }, createBanner('danger', message('MSG-118'))),
    );
  }
  root.replaceChildren(shell.element);
}
