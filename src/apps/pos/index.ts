import '../../styles/pos.css';
import '../../styles/pos-lanjut.css';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { createPosSession, type PosSession } from './pos-session';
import { applyTheme, loadTheme } from './theme';
import { renderBills } from './screens/bill';
import { renderCustomerForm } from './screens/customer-form';
import { renderExpense } from './screens/expense';
import { renderHistory } from './screens/history';
import { renderLogin, type ScreenHandle } from './screens/login';
import { renderPay } from './screens/pay';
import { renderSell } from './screens/sell';
import { renderStatus } from './screens/status';

export interface AppContext {
  readonly store: Store;
}

type Renderer = (session: PosSession, go: (path: string) => void) => ScreenHandle;

const ROUTES: Readonly<
  Record<string, { readonly id: string | undefined; readonly render: Renderer }>
> = {
  '/pos': { id: undefined, render: renderLogin },
  '/pos/jual': { id: 'POS-02', render: renderSell },
  '/pos/bayar': { id: 'POS-04', render: renderPay },
  '/pos/bill': { id: 'POS-05', render: renderBills },
  '/pos/riwayat': { id: 'POS-06', render: renderHistory },
  '/pos/biaya': { id: 'POS-07', render: renderExpense },
  '/pos/pelanggan-baru': { id: 'POS-08', render: renderCustomerForm },
  '/pos/status': { id: 'POS-09', render: renderStatus },
};

let session: PosSession | undefined;
let current: ScreenHandle | undefined;
let watched: Store | undefined;
let currentPath = '/pos';

function sessionFor(store: Store): PosSession {
  if (session?.store !== store) {
    session = createPosSession(store);
  }
  return session;
}

export function mount(root: HTMLElement, path: string, context: AppContext): void {
  const active = sessionFor(context.store);
  document.documentElement.dataset['app'] = 'pos';
  applyTheme(document.documentElement, loadTheme());
  currentPath = path;
  if (watched !== context.store) {
    watched = context.store;
    context.store.bus.on('role', ({ role: next }) => {
      const required = ROUTES[currentPath]?.id;
      if (required !== undefined && !canOpenScreen(next, required)) {
        navigate('/pos/jual');
      }
    });
  }

  let loggedIn = active.state().loggedIn;
  if (path !== '/pos' && !loggedIn && context.store.getState().reviewMode) {
    active.attemptLogin('U-3', '2468');
    loggedIn = active.state().loggedIn;
  }
  if (path !== '/pos' && !loggedIn) {
    navigate('/pos');
    return;
  }
  const role = context.store.getState().role;
  if (path === '/pos/bayar' && (!canOpenScreen(role, 'POS-04') || active.total() === 0)) {
    navigate('/pos/jual');
    return;
  }
  const screen = ROUTES[path];
  if (screen === undefined) {
    navigate('/pos');
    return;
  }
  if (screen.id !== undefined && !canOpenScreen(role, screen.id)) {
    navigate('/pos/jual');
    return;
  }
  current?.destroy();
  const go = (target: string): void => {
    navigate(target);
  };
  current = screen.render(active, go);
  root.replaceChildren(current.element);
}
