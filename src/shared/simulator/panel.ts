import { el } from '../dom';
import { icon } from '../icons';
import { label, message, type LabelKey } from '../messages';
import type { Role } from '../data/types';
import type { Store } from '../store/store';
import { createButton } from '../ui/button';
import { showToast } from '../ui/toast';

const ROLE_LABELS: Readonly<Record<Role, LabelKey>> = {
  owner: 'peranOwner',
  supervisor: 'peranSupervisor',
  kasir: 'peranKasir',
  frontliner: 'peranFrontliner',
  sales: 'peranSales',
};

export interface SimulationPanel {
  destroy(): void;
}

export function reviewModeFromLocation(search: string): boolean {
  return new URLSearchParams(search).get('tinjau') === '1';
}

export function reviewFlagFromLocation(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get('tinjau');
  return value === '1' ? true : value === '0' ? false : undefined;
}

export function mountSimulationPanel(
  store: Store,
  parent: HTMLElement = document.body,
): SimulationPanel {
  const root = el('aside', {
    className: 'sim',
    attrs: { 'data-simulator': 'true', 'aria-label': label('panelJudul') },
  });
  const launcher = el(
    'button',
    {
      className: 'sim__launcher',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sim-body' },
    },
    el('span', { text: label('panelJudul') }),
  );
  const body = el('div', { className: 'sim__body', attrs: { id: 'sim-body', hidden: '' } });
  const select = el('select', {
    className: 'sim__select',
    attrs: { id: 'sim-role' },
  });
  for (const role of ['owner', 'supervisor', 'kasir', 'frontliner', 'sales'] as const) {
    select.append(el('option', { text: label(ROLE_LABELS[role]), attrs: { value: role } }));
  }
  const connection = el('button', {
    className: 'sim__action',
    attrs: { type: 'button', 'aria-pressed': 'true' },
  });
  const connectionIcon = el('span', { className: 'sim__icon' });
  const connectionText = el('span');
  connection.append(connectionIcon, connectionText);
  const printer = el('button', {
    className: 'sim__action',
    attrs: { type: 'button', 'aria-pressed': 'true' },
  });
  const printerIcon = el('span', { className: 'sim__icon' });
  const printerText = el('span');
  printer.append(printerIcon, printerText);

  const limitButton = createButton({
    text: label('picuLimit'),
    variant: 'secondary',
    onClick: () => {
      const event = store.triggerLimitRejected();
      if (event?.kind === 'limit' && !event.decision.ok) {
        const id = event.decision.messageId;
        if (id === 'MSG-035' || id === 'MSG-036' || id === 'MSG-034') {
          showToast({ kind: 'error', text: message(id, event.decision.values) });
        }
      }
    },
  });
  limitButton.classList.add('sim__action');

  const negativeButton = createButton({
    text: label('picuStokNegatif'),
    variant: 'secondary',
    onClick: () => {
      if (store.triggerNegativeStock() !== undefined) {
        showToast({ kind: 'info', text: message('MSG-070') });
      }
    },
  });
  negativeButton.classList.add('sim__action');

  const resetButton = createButton({
    text: label('aturUlangData'),
    variant: 'secondary',
    onClick: () => {
      store.resetData();
      showToast({ kind: 'success', text: label('dataDiaturUlang') });
    },
  });
  resetButton.classList.add('sim__action');

  const reviewButton = createButton({
    text: label('modeTinjau'),
    variant: 'secondary',
    onClick: () => {
      store.setReviewMode(true);
    },
  });
  reviewButton.classList.add('sim__action');

  const actions = el(
    'div',
    { className: 'sim__actions' },
    limitButton,
    negativeButton,
    resetButton,
    reviewButton,
  );

  body.append(
    el('h2', { className: 'sim__title', text: label('panelJudul') }),
    el('label', { className: 'sim__label', text: label('panelPeran'), attrs: { for: 'sim-role' } }),
    select,
    connection,
    printer,
    actions,
  );
  root.append(launcher, body);
  parent.append(root);

  const render = (): void => {
    const state = store.getState();
    root.hidden = state.reviewMode;
    select.value = state.role;
    connection.setAttribute('aria-pressed', state.online ? 'true' : 'false');
    connectionText.textContent = label(state.online ? 'koneksiOnline' : 'koneksiOffline');
    connectionIcon.replaceChildren(icon(state.online ? 'wifi' : 'wifi-off'));
    printer.setAttribute('aria-pressed', state.printerConnected ? 'true' : 'false');
    printerText.textContent = label(
      state.printerConnected ? 'printerTerhubung' : 'printerTerputus',
    );
    printerIcon.replaceChildren(icon('printer'));
  };
  const toggle = (): void => {
    const open = body.hasAttribute('hidden');
    body.toggleAttribute('hidden', !open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      store.setReviewMode(!store.getState().reviewMode);
    }
  };

  launcher.addEventListener('click', toggle);
  select.addEventListener('change', () => {
    const role = (['owner', 'supervisor', 'kasir', 'frontliner', 'sales'] as const).find(
      (item) => item === select.value,
    );
    if (role !== undefined) {
      store.setRole(role);
    }
  });
  connection.addEventListener('click', () => {
    store.setOnline(!store.getState().online);
  });
  printer.addEventListener('click', () => {
    store.setPrinter(!store.getState().printerConnected);
  });
  document.addEventListener('keydown', onKey);
  const unsubscribe = store.subscribe(render);
  render();

  return {
    destroy: () => {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
