import { el, nextId } from '../dom';
import { FOCUSABLE_SELECTOR, isEscape, trapTab } from '../focus-trap';
import { createButton, type ButtonVariant } from './button';

export interface ModalAction {
  readonly text: string;
  readonly variant?: ButtonVariant;
  readonly onClick?: () => void;
}

export interface ModalOptions {
  readonly title: string;
  readonly body: string | Node;
  readonly actions: readonly ModalAction[];
  readonly scopeFrom?: Element;
  readonly onClose?: () => void;
}

export interface ModalHandle {
  readonly dialog: HTMLDivElement;
  close(): void;
}

const stack: HTMLElement[] = [];

export function openModal(options: ModalOptions): ModalHandle {
  const opener = document.activeElement;
  const titleId = nextId('modal-title');
  const scope = options.scopeFrom?.closest('[data-app]');
  const overlay = el('div', {
    className: 'modal-overlay',
    attrs: {
      'data-app': scope?.getAttribute('data-app') ?? undefined,
      'data-theme': scope?.getAttribute('data-theme') ?? undefined,
    },
  });
  const dialog = el(
    'div',
    {
      className: 'modal',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        tabindex: '-1',
      },
    },
    el('h2', {
      className: 'modal__title t-section-title',
      text: options.title,
      attrs: { id: titleId },
    }),
    el('div', { className: 'modal__body' }, options.body),
  );
  const actions = el('div', { className: 'modal__actions' });
  let closed = false;

  const siblings = Array.from(document.body.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.inert &&
      !child.hasAttribute('data-simulator') &&
      !child.classList.contains('sim'),
  );

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    stack.splice(stack.indexOf(overlay), 1);
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    for (const sibling of siblings) {
      sibling.inert = false;
    }
    document.body.classList.remove('is-modal-open');
    if (opener instanceof HTMLElement) {
      opener.focus();
    }
    options.onClose?.();
  };

  function onKeydown(event: KeyboardEvent): void {
    if (stack[stack.length - 1] !== overlay) {
      return;
    }
    if (isEscape(event)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const targets = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    trapTab(event, targets, document.activeElement);
  }

  for (const action of options.actions) {
    actions.append(
      createButton({
        text: action.text,
        variant: action.variant ?? 'secondary',
        onClick: () => {
          action.onClick?.();
          close();
        },
      }),
    );
  }
  dialog.append(actions);
  overlay.append(dialog);
  document.body.append(overlay);
  stack.push(overlay);
  for (const sibling of siblings) {
    sibling.inert = true;
  }
  document.body.classList.add('is-modal-open');
  document.addEventListener('keydown', onKeydown, true);
  dialog.focus();
  return { dialog, close };
}
