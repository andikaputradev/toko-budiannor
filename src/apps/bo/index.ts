import '../../styles/bo.css';
import '../../styles/tables.css';
import '../../styles/bo-sales.css';
import { el } from '../../shared/dom';
import { label, message } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import { createBoSession, type BoSession } from './bo-session';
import { renderDashboard } from './screens/dashboard';
import { renderLogin, type ScreenHandle } from './screens/login';
import { renderOpname } from './screens/opname';
import { renderSales } from './screens/sales';
import { renderProducts } from './screens/products';
import { renderStock } from './screens/stock';
import { renderTransfer } from './screens/transfer';
import { renderUnits } from './screens/units';
import { createShell, type Shell } from './shell';

export interface AppContext {
  readonly store: Store;
}

type Renderer = (
  session: BoSession,
  go: (path: string) => void,
  query: URLSearchParams,
) => ScreenHandle;

const ROUTES: Readonly<Record<string, { readonly id: string; readonly render: Renderer }>> = {
  '/bo/dashboard': { id: 'BO-02', render: (session, go) => renderDashboard(session, go) },
  '/bo/barang': { id: 'BO-03', render: (session, go) => renderProducts(session, go) },
  '/bo/harga': { id: 'BO-04', render: (session, _go, query) => renderUnits(session, query) },
  '/bo/stok': { id: 'BO-05', render: (session, go, query) => renderStock(session, go, query) },
  '/bo/mutasi': { id: 'BO-06', render: (session) => renderTransfer(session) },
  '/bo/opname': { id: 'BO-07', render: (session) => renderOpname(session) },
  '/bo/penjualan': { id: 'BO-09', render: (session) => renderSales(session) },
};

let session: BoSession | undefined;
let screen: ScreenHandle | undefined;
let shell: Shell | undefined;
let watched: Store | undefined;
let latest: { root: HTMLElement; path: string; context: AppContext } | undefined;

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

export function mount(root: HTMLElement, fullPath: string, context: AppContext): void {
  latest = { root, path: fullPath, context };
  const [path = '/bo', search = ''] = fullPath.split('?');
  const query = new URLSearchParams(search);
  const active = sessionFor(context.store);
  document.documentElement.dataset['app'] = 'bo';
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

  if (path === '/bo') {
    screen = renderLogin(active, go);
    root.replaceChildren(screen.element);
    screen.element.querySelector<HTMLInputElement>('.bo-login__input')?.focus();
    return;
  }
  if (active.state().user === undefined && context.store.getState().reviewMode) {
    active.login('sinta.spv', 'Kunci2026B');
  }
  if (active.state().user === undefined) {
    navigate('/bo');
    return;
  }
  const route = ROUTES[path];
  if (route === undefined) {
    navigate('/bo/dashboard');
    return;
  }
  shell = createShell(active, path, go);
  if (canOpenScreen(context.store.getState().role, route.id)) {
    screen = route.render(active, go, query);
    shell.content.replaceChildren(screen.element);
  } else {
    shell.content.replaceChildren(denied(active, go));
  }
  root.replaceChildren(shell.element);
}
