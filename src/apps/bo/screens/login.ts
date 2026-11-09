import { el, nextId } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import type { BoSession } from '../bo-session';

export interface ScreenHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

export function renderLogin(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const userId = nextId('bo-user');
  const passId = nextId('bo-pass');
  const username = el('input', {
    className: 'input bo-login__input',
    attrs: {
      id: userId,
      type: 'text',
      autocomplete: 'username',
      autocapitalize: 'none',
      spellcheck: 'false',
    },
  });
  const password = el('input', {
    className: 'input bo-login__input',
    attrs: { id: passId, type: 'password', autocomplete: 'current-password' },
  });
  const error = el('p', {
    className: 'bo-login__error',
    attrs: { role: 'alert', 'aria-live': 'assertive' },
  });
  const banner = el('div', { className: 'bo-banner' });
  const show = el('button', {
    className: 'btn btn--secondary bo-login__show',
    text: label('tampilkan'),
    attrs: { type: 'button' },
  });
  const submit = createButton({ text: label('masuk'), type: 'submit' });
  submit.classList.add('bo-login__submit');

  const reveal = (visible: boolean): void => {
    password.type = visible ? 'text' : 'password';
  };
  for (const type of ['pointerdown']) {
    show.addEventListener(type, () => {
      reveal(true);
    });
  }
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) {
    show.addEventListener(type, () => {
      reveal(false);
    });
  }
  show.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      reveal(true);
    }
  });
  show.addEventListener('keyup', () => {
    reveal(false);
  });
  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      reveal(event.type === 'keydown');
    }
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  const form = el(
    'form',
    { className: 'bo-login__form', attrs: { novalidate: '' } },
    el('label', { className: 'field__label', text: label('namaPengguna'), attrs: { for: userId } }),
    username,
    el('label', { className: 'field__label', text: label('kataSandi'), attrs: { for: passId } }),
    el('div', { className: 'bo-login__row' }, password, show),
    error,
    submit,
    el('p', { className: 't-label bo-login__help', text: label('lupaKataSandi') }),
  );

  const paint = (): void => {
    const online = store.getState().online;
    banner.replaceChildren(...(online ? [] : [createBanner('danger', message('MSG-001'))]));
    submit.toggleAttribute('data-inactive', !online);
    submit.setAttribute('aria-disabled', online ? 'false' : 'true');
  };
  const unsubscribe = store.subscribe(paint);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!store.getState().online) {
      return;
    }
    const result = session.login(username.value, password.value);
    if (result.ok) {
      error.textContent = '';
      go('/bo/dashboard');
      return;
    }
    error.textContent = message(result.messageId, result.values);
    password.value = '';
    (username.value.trim() === '' ? username : password).focus();
  });

  const element = el(
    'div',
    { className: 'bo bo--login' },
    el(
      'header',
      { className: 'bo-topbar' },
      el(
        'div',
        { className: 'bo-topbar__brand' },
        el('strong', { text: label('tokoNama') }),
        el('span', { className: 'bo-topbar__sub', text: label('backOffice') }),
      ),
    ),
    banner,
    el(
      'main',
      { className: 'bo-login' },
      el(
        'section',
        { className: 'bo-login__card' },
        el(
          'div',
          { className: 'bo-login__logo', attrs: { role: 'img', 'aria-label': label('logoToko') } },
          icon('store'),
        ),
        el('h1', { className: 'bo-login__title', text: label('judulMasukBo') }),
        form,
      ),
    ),
  );
  paint();
  username.focus();
  return {
    element,
    destroy: () => {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
    },
  };
}
