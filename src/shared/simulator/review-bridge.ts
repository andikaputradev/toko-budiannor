import { label } from '../messages';
import type { Store } from '../store/store';

export interface AppMessage {
  readonly source: 'tbpos-app';
  readonly hash: string;
  readonly online: boolean;
  readonly overlay: string | undefined;
}

export type ViewerCommand =
  | { readonly source: 'tbpos-viewer'; readonly action: 'online'; readonly value: boolean }
  | { readonly source: 'tbpos-viewer'; readonly action: 'reset' };

export function detectOverlay(root: ParentNode = document): string | undefined {
  const modal = root.querySelector('.modal');
  if (modal === null) {
    return undefined;
  }
  if (modal.querySelector('.pos-unit, .pos-line') !== null) {
    return 'POS-03';
  }
  if (modal.querySelector('.pos-auth') !== null) {
    return 'POS-10';
  }
  if (modal.querySelector('.modal__title')?.textContent === label('validasiPiutang')) {
    return 'SALES-04';
  }
  return undefined;
}

function isCommand(value: unknown): value is ViewerCommand {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    item['source'] === 'tbpos-viewer' &&
    ((item['action'] === 'online' && typeof item['value'] === 'boolean') ||
      item['action'] === 'reset')
  );
}

export function installReviewBridge(store: Store): void {
  if (window.parent === window || !store.getState().reviewMode) {
    return;
  }
  const report = (): void => {
    const message: AppMessage = {
      source: 'tbpos-app',
      hash: window.location.hash,
      online: store.getState().online,
      overlay: detectOverlay(),
    };
    window.parent.postMessage(message, window.location.origin);
  };
  store.subscribe(report);
  window.addEventListener('hashchange', report);
  window.addEventListener('load', report);
  new MutationObserver(report).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || !isCommand(event.data)) {
      return;
    }
    if (event.data.action === 'online') {
      store.setOnline(event.data.value);
    } else {
      store.resetData();
    }
    report();
  });
  report();
}
