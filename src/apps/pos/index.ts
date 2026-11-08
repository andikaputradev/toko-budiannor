import '../../styles/pos.css';
import '../../styles/pos-lanjut.css';
import '../../styles/pos-bill.css';
import '../../styles/pos-jual.css';
import '../../styles/pos-bayar.css';
import '../../styles/pos-riwayat.css';
import '../../styles/pos-retur.css';
import '../../styles/pos-karyawan.css';
import '../../styles/pos-biaya.css';
import '../../styles/pos-responsif.css';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { Store } from '../../shared/store/store';
import { needsShift, REVIEW_OPENING_CASH } from './domain/shift';
import { createPosSession, type PosSession } from './pos-session';
import {
  applyAppearance,
  loadMode,
  loadTheme,
  migrateLegacyTheme,
  parseMode,
  parseTheme,
  prefersDark,
  watchScheme,
} from './theme';
import { renderBills } from './screens/bill';
import { renderCustomerForm } from './screens/customer-form';
import { renderEmployees } from './screens/employees';
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
  '/pos/karyawan': { id: 'POS-11', render: renderEmployees },
};

let session: PosSession | undefined;
let current: ScreenHandle | undefined;
let watched: Store | undefined;
let currentPath = '/pos';
let stopSchemeWatch: (() => void) | undefined;

// Setelah dipasang, pilihan palet dan mode hidup di atribut akar; pengamat perangkat memakainya
// sehingga tetap benar walau penyimpanan diblokir.
function refreshScheme(): void {
  const root = document.documentElement;
  applyAppearance(
    root,
    parseTheme(root.dataset['posTheme'] ?? null),
    parseMode(root.dataset['posMode'] ?? null),
    prefersDark(),
  );
}

function sessionFor(store: Store): PosSession {
  if (session?.store !== store) {
    session = createPosSession(store);
  }
  return session;
}

export function mount(root: HTMLElement, path: string, context: AppContext): void {
  const active = sessionFor(context.store);
  document.documentElement.dataset['app'] = 'pos';
  migrateLegacyTheme();
  applyAppearance(document.documentElement, loadTheme(), loadMode(), prefersDark());
  stopSchemeWatch ??= watchScheme(refreshScheme);
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
  if (
    loggedIn &&
    context.store.getState().reviewMode &&
    context.store.getState().role !== 'frontliner' &&
    active.state().shift === undefined
  ) {
    active.startShift(REVIEW_OPENING_CASH);
  }
  if (path !== '/pos' && !loggedIn) {
    navigate('/pos');
    return;
  }
  const role = context.store.getState().role;
  if (
    path === '/pos/bayar' &&
    (!canOpenScreen(role, 'POS-04') ||
      active.total() === 0 ||
      needsShift(role, active.state().shift))
  ) {
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
