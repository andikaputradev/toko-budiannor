import { el } from '../dom';
import { icon, type IconName } from '../icons';
import { label } from '../messages';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonOptions {
  readonly text: string;
  readonly variant?: ButtonVariant;
  readonly icon?: IconName;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly pressed?: boolean;
  readonly pay?: boolean;
  readonly onClick?: (event: MouseEvent) => void;
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const variant = options.variant ?? 'primary';
  const loading = options.loading === true;
  const classes = ['btn', `btn--${variant}`];
  if (options.pay === true) {
    classes.push('btn--pay');
  }
  const button = el(
    'button',
    {
      className: classes.join(' '),
      attrs: {
        type: options.type ?? 'button',
        disabled: (options.disabled === true || loading) && '',
        'aria-busy': loading && 'true',
        'data-pressed': options.pressed === true && 'true',
      },
    },
    options.icon !== undefined && !loading && icon(options.icon),
    el('span', { text: loading ? label('menyimpan') : options.text }),
  );
  if (options.onClick !== undefined) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}
