import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/simulator.css';
import { currentPath, navigate, onRouteChange } from './shared/router';
import { mountSimulationPanel, reviewFlagFromLocation } from './shared/simulator/panel';
import { installReviewBridge } from './shared/simulator/review-bridge';
import { createSessionPersistence, createStore } from './shared/store/store';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Elemen #root tidak ditemukan pada index.html');
}

let leave: (() => void) | undefined;
let renderSeq = 0;

async function render(path: string): Promise<void> {
  if (root === null) {
    return;
  }
  const seq = ++renderSeq;
  leave?.();
  leave = undefined;
  delete document.documentElement.dataset['view'];
  if (path === '/' || path === '/gaya' || path === '/tinjau' || path.startsWith('/tinjau?')) {
    const portal = await import('./apps/portal/index');
    if (seq !== renderSeq) return;
    leave = portal.mount(root, path);
    return;
  }
  if (path === '/pos' || path.startsWith('/pos/')) {
    const pos = await import('./apps/pos/index');
    if (seq !== renderSeq) return;
    pos.mount(root, path, { store });
    return;
  }
  if (path === '/bo' || path.startsWith('/bo/')) {
    const bo = await import('./apps/bo/index');
    if (seq !== renderSeq) return;
    bo.mount(root, path, { store });
    return;
  }
  if (path === '/owner' || path.startsWith('/owner/')) {
    const owner = await import('./apps/owner/index');
    if (seq !== renderSeq) return;
    owner.mount(root, path, { store });
    return;
  }
  if (path === '/sales' || path.startsWith('/sales/')) {
    const sales = await import('./apps/sales/index');
    if (seq !== renderSeq) return;
    sales.mount(root, path, { store });
    return;
  }
  navigate('/');
}

const store = createStore({
  persistence: createSessionPersistence(),
  reviewMode: reviewFlagFromLocation(window.location.search) ?? false,
});
mountSimulationPanel(store);
installReviewBridge(store);

onRouteChange((path) => {
  void render(path);
});
void render(currentPath());
