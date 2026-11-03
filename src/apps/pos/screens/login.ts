import { el } from '../../../shared/dom';
import { label, message, type LabelKey } from '../../../shared/messages';
import { icon } from '../../../shared/icons';
import type { AppUser, Role } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createPinPad } from '../../../shared/ui/pinpad';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';

const ROLE_LABELS: Readonly<Record<Role, LabelKey>> = {
  owner: 'peranOwner',
  supervisor: 'peranSupervisor',
  kasir: 'peranKasir',
  frontliner: 'peranFrontliner',
  sales: 'peranSales',
};

export interface ScreenHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

export function renderLogin(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulPilihKasir');
  const users = session.store
    .getState()
    .data.users.filter((user) => user.active && user.role !== 'sales');
  let selected = users.length === 1 ? users[0]?.id : undefined;
  const pad = createPinPad({ maxLength: 6 });
  const error = el('p', {
    className: 'pos-login__error',
    attrs: { role: 'alert', 'aria-live': 'assertive' },
  });
  const cards = new Map<string, HTMLButtonElement>();

  const paint = (): void => {
    for (const [id, card] of cards) {
      card.setAttribute('aria-checked', id === selected ? 'true' : 'false');
    }
    submit.toggleAttribute('data-inactive', selected === undefined);
  };
  const choose = (user: AppUser): void => {
    selected = user.id;
    error.textContent = '';
    paint();
    pad.element.querySelector<HTMLElement>('.pinpad__key')?.focus();
  };

  const list = el('div', {
    className: 'pos-login__cards',
    attrs: { role: 'radiogroup', 'aria-label': label('judulPilihKasir') },
  });
  for (const user of users) {
    const card = el(
      'button',
      {
        className: 'pos-login__card',
        attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
      },
      el('span', { className: 'pos-login__avatar', text: user.name.slice(0, 1) }),
      el(
        'span',
        { className: 'pos-login__who' },
        el('strong', { text: user.name.slice(0, 20) }),
        el('span', { className: 't-label', text: label(ROLE_LABELS[user.role]) }),
      ),
    );
    card.addEventListener('click', () => {
      choose(user);
    });
    cards.set(user.id, card);
    list.append(card);
  }
  const empty = el(
    'p',
    { className: 'pos-login__empty' },
    icon('info'),
    el('span', { text: label('kasirKosong') }),
  );

  const submit = createButton({
    text: label('masuk'),
    onClick: () => {
      const result = session.attemptLogin(selected, pad.value());
      if (result.ok) {
        go('/pos/jual');
        return;
      }
      error.textContent = message(result.messageId, result.values);
      pad.reset();
    },
  });
  submit.classList.add('pos-login__submit');

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (/^\d$/.test(event.key)) {
      pad.press(event.key);
    } else if (event.key === 'Backspace') {
      pad.backspace();
    } else if (event.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
      submit.click();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const index = users.findIndex((user) => user.id === selected);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = users[(index + step + users.length) % users.length];
      if (next !== undefined) {
        choose(next);
      }
    }
  };
  document.addEventListener('keydown', onKey);

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-login' },
      users.length === 0 ? empty : list,
      el(
        'section',
        { className: 'pos-login__panel' },
        el('p', { className: 'pos-login__pin-label t-label', text: label('pinLabel') }),
        pad.element,
        submit,
        error,
      ),
    ),
  );
  paint();
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
