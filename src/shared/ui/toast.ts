import { el } from '../dom';
import { icon } from '../icons';
import { label } from '../messages';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastOptions {
  readonly kind: ToastKind;
  readonly text: string;
  readonly scopeFrom?: Element;
  readonly duration?: number;
}

export interface ToastHandle {
  readonly element: HTMLElement;
  dismiss(): void;
}

let toastHost: HTMLElement | null = null;

function getToastHost(): HTMLElement {
  if (!toastHost?.isConnected) {
    toastHost = el('div', {
      className: 'toast-host',
      attrs: {
        'aria-live': 'polite',
      },
    });
    document.body.append(toastHost);
  }
  return toastHost;
}

export function showToast(options: ToastOptions): ToastHandle {
  const host = getToastHost();
  for (const existing of Array.from(host.querySelectorAll('.toast'))) {
    if (existing.querySelector('.toast__text')?.textContent === options.text) {
      existing.remove();
    }
  }
  const scope = options.scopeFrom?.closest('[data-app]');

  const toast = el(
    'div',
    {
      className: `toast toast--${options.kind}`,
      attrs: {
        role: options.kind === 'error' ? 'alert' : 'status',
        'data-app': scope?.getAttribute('data-app') ?? undefined,
        'data-theme': scope?.getAttribute('data-theme') ?? undefined,
      },
    },
    el('span', { className: 'toast__text', text: options.text }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;

  const dismiss = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    toast.remove();
  };

  if (options.kind === 'error') {
    const closeButton = el(
      'button',
      {
        className: 'toast__close',
        attrs: {
          type: 'button',
          'aria-label': label('tutup'),
        },
      },
      icon('x'),
    );
    closeButton.addEventListener('click', () => {
      dismiss();
    });
    toast.append(closeButton);
  }

  const duration = options.duration ?? (options.kind === 'error' ? 0 : 4000);
  if (duration > 0) {
    timer = setTimeout(() => {
      dismiss();
    }, duration);
  }

  host.append(toast);
  return { element: toast, dismiss };
}
