import { icon } from '../../../shared/icons';
import { openAppearanceSheet } from '../../../shared/ui/appearance';
import { el, nextId } from '../../../shared/dom';
import { label, message } from '../../../shared/messages';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import type { ScreenHandle } from '../../../shared/ui/screen';
import type { SalesSession } from '../sales-session';

const REVEAL_MS = 3000;

export function renderLogin(session: SalesSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const userId = nextId('sal-user');
  const passId = nextId('sal-pass');
  const username = el('input', {
    className: 'input own-login__input',
    attrs: {
      id: userId,
      type: 'text',
      autocomplete: 'username',
      autocapitalize: 'none',
      spellcheck: 'false',
    },
  });
  const password = el('input', {
    className: 'input own-login__input',
    attrs: { id: passId, type: 'password', autocomplete: 'current-password' },
  });
  const show = el('button', {
    className: 'btn btn--secondary own-login__show',
    text: label('tampilkan'),
    attrs: { type: 'button', 'aria-pressed': 'false' },
  });
  const error = el('p', { className: 'own-login__error', attrs: { role: 'alert' } });
  const banner = el('div', { className: 'own-banner' });
  const submit = createButton({ text: label('masuk'), type: 'submit' });
  submit.classList.add('own-login__submit');
  let hideTimer: number | undefined;

  const reveal = (visible: boolean): void => {
    window.clearTimeout(hideTimer);
    password.type = visible ? 'text' : 'password';
    show.setAttribute('aria-pressed', visible ? 'true' : 'false');
    if (visible) {
      hideTimer = window.setTimeout(() => {
        reveal(false);
      }, REVEAL_MS);
    }
  };
  show.addEventListener('click', () => {
    reveal(password.type === 'password');
  });

  const form = el(
    'form',
    { className: 'own-login__form', attrs: { novalidate: '' } },
    el('label', { className: 'field__label', text: label('namaPengguna'), attrs: { for: userId } }),
    username,
    el('label', { className: 'field__label', text: label('kataSandi'), attrs: { for: passId } }),
    el('div', { className: 'own-login__row' }, password, show),
    error,
    submit,
  );

  const paint = (): void => {
    const online = store.getState().online;
    banner.replaceChildren(
      ...(online ? [] : [createBanner('offline', label('offlineMasukSales'))]),
    );
  };
  const stop = store.subscribe(paint);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = session.login(username.value, password.value);
    if (result.ok) {
      error.textContent = '';
      go('/sales/katalog');
      return;
    }
    error.textContent =
      'messageId' in result ? message(result.messageId, result.values) : label(result.labelKey);
    password.value = '';
    (username.value.trim() === '' ? username : password).focus();
  });

  const themeButton = el(
    'button',
    {
      className: 'own-icon-button mob-login-theme',
      attrs: { type: 'button', 'aria-label': label('menuTema') },
    },
    icon('palette'),
  );
  themeButton.addEventListener('click', () => {
    openAppearanceSheet();
  });

  const element = el(
    'div',
    { className: 'own own--login' },
    banner,
    themeButton,
    el(
      'main',
      { className: 'own-login' },
      el('img', {
        className: 'own-login__logo own-login__logo--image',
        attrs: {
          src: `${import.meta.env.BASE_URL}logo/login-sales.png`,
          alt: label('logoToko'),
          width: '120',
          height: '120',
        },
      }),
      el('h1', { className: 'own-login__title', text: label('judulSales') }),
      el('p', { className: 't-label own-login__sub', text: label('aplikasiMobile') }),
      form,
    ),
  );
  paint();
  username.focus();
  return {
    element,
    destroy: () => {
      stop();
      window.clearTimeout(hideTimer);
    },
  };
}
