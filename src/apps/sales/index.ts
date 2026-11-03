import '../../styles/owner.css';
import '../../styles/sales.css';
import { el } from '../../shared/dom';
import { label, type LabelKey } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { createBanner } from '../../shared/ui/banner';
import type { ScreenHandle } from '../../shared/ui/screen';
import { createStorageVault } from './domain/auth';
import { createSalesSession, type SalesSession } from './sales-session';
import { renderCatalog } from './screens/catalog';
import { renderHistory } from './screens/history';
import { renderLogin } from './screens/login';
import { renderOrder } from './screens/order';
import { createSalesShell, type SalesShell } from './shell';

export interface AppContext {
  readonly store: Store;
}

type Renderer = (
  session: SalesSession,
  go: (path: string) => void,
  query: URLSearchParams,
) => ScreenHandle;

const ROUTES: Readonly<
  Record<string, { readonly id: string; readonly title: LabelKey; readonly render: Renderer }>
> = {
  '/sales/katalog': {
    id: 'SALES-02',
    title: 'judulKatalog',
    render: (session, go) => renderCatalog(session, go),
  },
  '/sales/order': {
    id: 'SALES-03',
    title: 'judulOrder',
    render: (session, go) => renderOrder(session, go),
  },
  '/sales/riwayat': {
    id: 'SALES-05',
    title: 'judulRiwayatSo',
    render: (session, go, query) => renderHistory(session, go, query),
  },
};

let session: SalesSession | undefined;
let screen: ScreenHandle | undefined;
let shell: SalesShell | undefined;
let watched: Store | undefined;
let latest: { root: HTMLElement; path: string; context: AppContext } | undefined;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function sessionFor(store: Store): SalesSession {
  if (session?.store !== store) {
    session = createSalesSession(store, { vault: createStorageVault(storage()) });
  }
  return session;
}

function render(root: HTMLElement, fullPath: string, context: AppContext, restore: boolean): void {
  latest = { root, path: fullPath, context };
  const [path = '/sales', search = ''] = fullPath.split('?');
  const query = new URLSearchParams(search);
  const active = sessionFor(context.store);
  document.documentElement.dataset['app'] = 'sales';
  if (watched !== context.store) {
    watched = context.store;
    context.store.bus.on('role', () => {
      if (latest !== undefined) {
        render(latest.root, latest.path, latest.context, false);
      }
    });
  }
  if (restore) {
    active.activate();
  }
  const go = (target: string): void => {
    navigate(target);
  };

  screen?.destroy();
  shell?.destroy();
  screen = undefined;
  shell = undefined;

  if (path === '/sales') {
    if (active.signedIn()) {
      navigate('/sales/katalog');
      return;
    }
    screen = renderLogin(active, go);
    root.replaceChildren(screen.element);
    return;
  }
  if (!active.signedIn()) {
    navigate('/sales');
    return;
  }
  const route = ROUTES[path];
  if (route === undefined) {
    navigate('/sales/katalog');
    return;
  }
  shell = createSalesShell(active, path, route.title, go);
  if (canOpenScreen(context.store.getState().role, route.id)) {
    screen = route.render(active, go, query);
    shell.content.replaceChildren(screen.element);
  } else {
    shell.content.replaceChildren(
      el('div', { className: 'own-stack' }, createBanner('danger', label('hanyaSales'))),
    );
  }
  root.replaceChildren(shell.element);
}

export function mount(root: HTMLElement, fullPath: string, context: AppContext): void {
  render(root, fullPath, context, true);
}
